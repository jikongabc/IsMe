#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_VERSION = "isme-security-policy-v3";
const ALLOWED_ADVISORY = "GHSA-vfj7-8cjw-p6xm";
const EXPIRES_AT = "2026-10-19T00:00:00+08:00";
const EXPIRES_AT_MS = Date.parse(EXPIRES_AT);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_HIGH_CRITICAL = ["@next/eslint-plugin-next", "braces", "eslint-config-next", "fast-glob", "micromatch"];
const EXPECTED_FULL_COUNTS = { info: 0, low: 1, moderate: 6, high: 5, critical: 0, total: 12 };
const EXPECTED_FULL_ADVISORIES = [
  "GHSA-67mh-4wv8-2f99", "GHSA-82fw-gwwq-j7x9", "GHSA-p98j-92pf-mc4p", "GHSA-vfj7-8cjw-p6xm",
];
const EXPECTED_FULL_VULNERABILITIES = [
  { name: "@esbuild-kit/core-utils", severity: "moderate", advisories: ["GHSA-67mh-4wv8-2f99"], nodes: ["node_modules/@esbuild-kit/core-utils"] },
  { name: "@esbuild-kit/esm-loader", severity: "moderate", advisories: ["GHSA-67mh-4wv8-2f99"], nodes: ["node_modules/@esbuild-kit/esm-loader"] },
  { name: "@next/eslint-plugin-next", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/@next/eslint-plugin-next"] },
  { name: "@vitest/mocker", severity: "moderate", advisories: ["GHSA-82fw-gwwq-j7x9"], nodes: ["node_modules/vitest/node_modules/@vitest/mocker"] },
  { name: "braces", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/braces"] },
  { name: "dompurify", severity: "low", advisories: ["GHSA-p98j-92pf-mc4p"], nodes: ["node_modules/dompurify"] },
  { name: "drizzle-kit", severity: "moderate", advisories: ["GHSA-67mh-4wv8-2f99"], nodes: ["node_modules/drizzle-kit"] },
  { name: "esbuild", severity: "moderate", advisories: ["GHSA-67mh-4wv8-2f99"], nodes: ["node_modules/@esbuild-kit/core-utils/node_modules/esbuild"] },
  { name: "eslint-config-next", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/eslint-config-next"] },
  { name: "fast-glob", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/fast-glob"] },
  { name: "micromatch", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/micromatch"] },
  { name: "vitest", severity: "moderate", advisories: ["GHSA-82fw-gwwq-j7x9"], nodes: ["node_modules/vitest"] },
];
const EXPECTED_CHAIN_FROM_LEAF = [
  ["braces", "3.0.3"], ["micromatch", "4.0.8"], ["fast-glob", "3.3.1"],
  ["@next/eslint-plugin-next", "16.3.4"], ["eslint-config-next", "16.3.4"],
];
const OPTIONAL_PACKAGES = {
  "@emnapi/runtime": {
    path: "node_modules/@emnapi/runtime", version: "1.11.3",
    resolved: "https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.11.3.tgz",
    integrity: "sha512-Xz4Tpyki7XyrpbUK1jR1AhdAdaXyhhY4lZ3neLodmhpuWfy2PAQN5B46sAiU4liOXGLkHypn/qU+jvfWSCYYLA==",
    contentHash: "c81ef9794ff7f66ce8a263a9662caa2f114e9bea703cee4e45c603cbb45e179f", fileCount: 17,
  },
  "@img/sharp-wasm32": {
    path: "node_modules/@img/sharp-wasm32", version: "0.35.5",
    resolved: "https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.35.5.tgz",
    integrity: "sha512-Ptsga1su4tQx+LLF1ECS9U6nz5kmrXKo6XVbtR48Ke3ZRxxgaWBu7IDtEe1quo8hiupwm6WFqxVlXaSf7IINGQ==",
    contentHash: "0c5a32acc7b0bea64c297fc9c31cf63bcf52c20ee765ed5b330f96a8a55e3618", fileCount: 7,
  },
};
const EXPECTED_EXTRANEOUS = Object.entries(OPTIONAL_PACKAGES)
  .map(([name, value]) => ({ name, version: value.version })).sort((a, b) => a.name.localeCompare(b.name));
const DECLARATION_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

function runCommand(command, args) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { command: [command, ...args], exitCode: result.status, signal: result.signal,
    stdout: result.stdout ?? "", stderr: result.stderr ?? "",
    error: result.error ? { code: result.error.code ?? null, message: result.error.message } : null };
}
function parseJsonCommand(result) {
  try { return { ...result, parsed: JSON.parse(result.stdout), jsonValid: true }; }
  catch (error) { return { ...result, parsed: null, jsonValid: false,
    parseError: error instanceof Error ? error.message : String(error) }; }
}
function auditCounts(report) {
  const counts = report?.metadata?.vulnerabilities ?? {};
  return Object.fromEntries(["info", "low", "moderate", "high", "critical", "total"].map((name) => [name, Number(counts[name] ?? 0)]));
}
function advisoryId(via) {
  const matched = [via?.url, via?.title, via?.name].filter(Boolean).join(" ").match(/GHSA-[0-9a-z-]+/i)?.[0];
  return matched ? `GHSA-${matched.slice(5).toLowerCase()}` : null;
}
function resolveAdvisories(name, vulnerabilities, visited = new Set()) {
  if (visited.has(name)) return { ids: [], unresolved: [`cycle:${name}`] };
  const vulnerability = vulnerabilities[name];
  if (!vulnerability || !Array.isArray(vulnerability.via)) return { ids: [], unresolved: [name] };
  const ids = [], unresolved = [], nextVisited = new Set(visited).add(name);
  for (const via of vulnerability.via) {
    if (typeof via === "string") {
      const result = resolveAdvisories(via, vulnerabilities, nextVisited);
      ids.push(...result.ids); unresolved.push(...result.unresolved);
    } else {
      const id = advisoryId(via); if (id) ids.push(id); else unresolved.push(`${name}:missing-advisory-id`);
    }
  }
  return { ids: [...new Set(ids)].sort(), unresolved: [...new Set(unresolved)].sort() };
}
function inspectExceptionChain(report) {
  const summary = { expected: EXPECTED_CHAIN_FROM_LEAF.map(([name, version]) => ({ name, version })), actual: [], devOnly: false, matches: false, reason: null };
  if (!Array.isArray(report) || report.length !== 1) { summary.reason = "expected exactly one installed braces package"; return summary; }
  let current = report[0]; summary.devOnly = current.dev === true;
  for (let index = 0; index < EXPECTED_CHAIN_FROM_LEAF.length; index += 1) {
    const [name, version] = EXPECTED_CHAIN_FROM_LEAF[index];
    summary.actual.push({ name: current?.name ?? null, version: current?.version ?? null });
    if (current?.name !== name || current?.version !== version) { summary.reason = `chain node ${index} did not match`; return summary; }
    const parents = current?.dependents;
    if (index === EXPECTED_CHAIN_FROM_LEAF.length - 1) {
      if (!Array.isArray(parents) || parents.length !== 1 || parents[0]?.type !== "dev" ||
          parents[0]?.name !== "eslint-config-next" || parents[0]?.spec !== "16.3.4" || parents[0]?.from?.name) {
        summary.reason = "eslint-config-next is not a single direct dev dependency"; return summary;
      }
    } else {
      if (!Array.isArray(parents) || parents.length !== 1) { summary.reason = `chain node ${index} has an unexpected parent count`; return summary; }
      current = parents[0]?.from;
    }
  }
  if (!summary.devOnly) { summary.reason = "braces is not marked dev-only"; return summary; }
  summary.matches = true; return summary;
}
function makeAuditSummary(report) {
  const vulnerabilities = report?.vulnerabilities ?? {};
  const all = Object.entries(vulnerabilities).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => {
    const resolved = resolveAdvisories(name, vulnerabilities);
    return { name, severity: value?.severity ?? null, advisories: resolved.ids,
      nodes: Array.isArray(value?.nodes) ? [...value.nodes].sort() : null, unresolved: resolved.unresolved };
  });
  return { counts: auditCounts(report), all, highCritical: all.filter(({ severity }) => ["high", "critical"].includes(severity)) };
}
function decideSecurity({ production, full, tree, nowMs }) {
  if (!production.jsonValid || production.report?.error) return { accepted: false, code: "PRODUCTION_AUDIT_INVALID" };
  const prod = makeAuditSummary(production.report);
  if (prod.counts.high || prod.counts.critical || prod.highCritical.length) return { accepted: false, code: "PRODUCTION_HIGH_CRITICAL" };
  if (production.exitCode !== 0) return { accepted: false, code: "PRODUCTION_AUDIT_INVALID" };
  if (!full.jsonValid || ![0, 1].includes(full.exitCode) || full.report?.error) return { accepted: false, code: "FULL_AUDIT_INVALID" };
  const summary = makeAuditSummary(full.report), actual = summary.highCritical.map(({ name }) => name).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...EXPECTED_HIGH_CRITICAL].sort()) ||
      summary.counts.high !== 5 || summary.counts.critical !== 0 || full.exitCode !== 1) return { accepted: false, code: "UNEXPECTED_HIGH_CRITICAL" };
  if (summary.highCritical.some((item) => item.unresolved.length || JSON.stringify(item.advisories) !== JSON.stringify([ALLOWED_ADVISORY])))
    return { accepted: false, code: "UNEXPECTED_HIGH_CRITICAL" };
  if (summary.all.some((item) => item.unresolved.length)) return { accepted: false, code: "FULL_AUDIT_UNRESOLVED_ADVISORY" };
  const advisoryIds = [...new Set(summary.all.flatMap(({ advisories }) => advisories))].sort();
  if (JSON.stringify(advisoryIds) !== JSON.stringify(EXPECTED_FULL_ADVISORIES))
    return { accepted: false, code: "FULL_AUDIT_ADVISORY_SET_MISMATCH" };
  if (JSON.stringify(summary.counts) !== JSON.stringify(EXPECTED_FULL_COUNTS))
    return { accepted: false, code: "FULL_AUDIT_COUNTS_MISMATCH" };
  const actualMapping = summary.all.map((item) => ({
    name: item.name, severity: item.severity, advisories: item.advisories, nodes: item.nodes,
  }));
  if (JSON.stringify(actualMapping) !== JSON.stringify(EXPECTED_FULL_VULNERABILITIES))
    return { accepted: false, code: "FULL_AUDIT_MAPPING_MISMATCH" };
  if (!tree.jsonValid || tree.exitCode !== 0) return { accepted: false, code: "SECURITY_DEPENDENCY_TREE_INVALID" };
  if (!inspectExceptionChain(tree.report).matches) return { accepted: false, code: "SECURITY_EXCEPTION_CHAIN_MISMATCH" };
  if (!Number.isFinite(nowMs) || nowMs >= EXPIRES_AT_MS) return { accepted: false, code: "SECURITY_EXCEPTION_EXPIRED" };
  return { accepted: true, code: "SECURITY_EXCEPTION_ACCEPTED" };
}

const utf8Compare = (a, b) => Buffer.from(a).compare(Buffer.from(b));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, (_key, item) => !item || Array.isArray(item) || typeof item !== "object"
  ? item : Object.fromEntries(Object.entries(item).sort(([a], [b]) => utf8Compare(a, b))));
async function packageContentHash(root) {
  const entries = [];
  async function walk(directory) {
    const children = (await readdir(directory, { withFileTypes: true })).sort((a, b) => utf8Compare(a.name, b.name));
    for (const child of children) {
      if (child.name === "node_modules" && child.isDirectory()) continue;
      const path = resolve(directory, child.name), rel = relative(root, path).split(sep).join("/");
      const stats = await lstat(path), mode = (stats.mode & 0o777777).toString(8);
      if (stats.isDirectory()) await walk(path);
      else if (stats.isSymbolicLink()) entries.push({ mode, path: rel, sha256: sha256(Buffer.from(await readlink(path), "utf8")), type: "symlink" });
      else if (stats.isFile()) entries.push({ mode, path: rel, sha256: sha256(await readFile(path)), type: "file" });
    }
  }
  await walk(root); entries.sort((a, b) => utf8Compare(a.path, b.path));
  return { algorithm: "canonical-json-sha256-v1", fileCount: entries.length, sha256: sha256(canonical(entries)) };
}
async function scanInstalledPackages() {
  const packages = [], seen = new Set();
  async function scan(nodeModules) {
    if (seen.has(nodeModules)) return; seen.add(nodeModules);
    let children; try { children = await readdir(nodeModules, { withFileTypes: true }); } catch { return; }
    const roots = [];
    for (const child of children) {
      if (child.name.startsWith(".")) continue;
      const path = resolve(nodeModules, child.name);
      if (child.name.startsWith("@") && child.isDirectory()) {
        for (const nested of await readdir(path, { withFileTypes: true })) if (nested.isDirectory() || nested.isSymbolicLink()) roots.push(resolve(path, nested.name));
      } else if (child.isDirectory() || child.isSymbolicLink()) roots.push(path);
    }
    for (const root of roots) {
      try {
        const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
        packages.push({ absolutePath: root, path: relative(REPO_ROOT, root).split(sep).join("/"), name: manifest.name, version: manifest.version, manifest });
      } catch {}
      await scan(resolve(root, "node_modules"));
    }
  }
  await scan(resolve(REPO_ROOT, "node_modules")); packages.sort((a, b) => utf8Compare(a.path, b.path)); return packages;
}
function resolveInstalledDependency(fromPath, name, installed) {
  let directory = fromPath;
  while (directory.startsWith(REPO_ROOT)) {
    const candidate = resolve(directory, "node_modules", ...name.split("/"));
    if (installed.has(candidate)) return candidate;
    if (directory === REPO_ROOT) break; directory = dirname(directory);
  }
  return null;
}
function inspectInstalledGraph(rootManifest, packages) {
  const installed = new Map(packages.map((item) => [item.absolutePath, item]));
  const nodes = [{ absolutePath: REPO_ROOT, path: ".", manifest: rootManifest }, ...packages];
  const incoming = { "@img/sharp-wasm32": [], "@emnapi/runtime": [] }, edges = new Map();
  for (const node of nodes) {
    const targets = [];
    // Published package devDependencies are authoring metadata, not installed
    // runtime edges. Root devDependencies are real install roots; package
    // dependencies, optionalDependencies and peers form the installed graph.
    const graphFields = node.path === "."
      ? DECLARATION_FIELDS
      : ["dependencies", "optionalDependencies", "peerDependencies"];
    for (const field of graphFields) for (const [name, spec] of Object.entries(node.manifest?.[field] ?? {})) {
      const target = resolveInstalledDependency(node.absolutePath, name, installed); if (target) targets.push(target);
      if (incoming[name]) incoming[name].push({ from: node.path, field, spec,
        resolvedPath: target ? relative(REPO_ROOT, target).split(sep).join("/") : null });
    }
    edges.set(node.absolutePath, [...new Set(targets)]);
  }
  const reachable = new Set(), queue = [...(edges.get(REPO_ROOT) ?? [])];
  while (queue.length) { const path = queue.shift(); if (reachable.has(path)) continue; reachable.add(path); queue.push(...(edges.get(path) ?? [])); }
  return { incoming, reachableTargets: Object.fromEntries(Object.entries(OPTIONAL_PACKAGES).map(([name, value]) => [name, reachable.has(resolve(REPO_ROOT, value.path))])) };
}
function inspectTree(result) {
  const report = result.parsed, pattern = /^([^:]+):\s+((?:@[^/\s]+\/)?[^@\s]+)@([^\s]+)/;
  const anomalies = (report?.problems ?? []).map((problem) => {
    const match = String(problem).match(pattern);
    return match ? { type: match[1].trim(), name: match[2], version: match[3] } : { type: "unparsed", name: String(problem), version: null };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const flags = [];
  function walk(node, path = "root") {
    if (!node || typeof node !== "object") return;
    for (const flag of ["invalid", "missing", "peerMissing"]) if (node[flag]) flags.push({ flag, path });
    for (const [name, child] of Object.entries(node.dependencies ?? {})) walk(child, `${path}>${name}`);
  }
  walk(report);
  const roots = Object.fromEntries(Object.keys(OPTIONAL_PACKAGES).map((name) => { const node = report?.dependencies?.[name];
    return [name, { version: node?.version ?? null, extraneous: node?.extraneous === true, invalid: !!node?.invalid, missing: !!node?.missing, peerMissing: !!node?.peerMissing }]; }));
  return { rawExitCode: result.exitCode, jsonValid: result.jsonValid, anomalies, flags, roots };
}
function inspectLock(lockfile) {
  const records = {};
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) {
    const record = lockfile.packages?.[expected.path];
    records[name] = record ? { version: record.version, resolved: record.resolved, integrity: record.integrity,
      optional: record.optional, dependencies: record.dependencies ?? {} } : null;
  }
  return { lockfileVersion: lockfile.lockfileVersion, records, sharp: lockfile.packages?.["node_modules/sharp"] ?? null,
    sharpWebcontainers: lockfile.packages?.["node_modules/@img/sharp-webcontainers-wasm32"] ?? null,
    sharpFreebsd: lockfile.packages?.["node_modules/@img/sharp-freebsd-wasm32"] ?? null };
}
async function runSharpSmoke() {
  const require = createRequire(resolve(REPO_ROOT, "package.json")), calls = [], originals = {};
  for (const name of ["compile", "compileStreaming", "instantiate", "instantiateStreaming"]) if (typeof WebAssembly[name] === "function") {
    originals[name] = WebAssembly[name]; WebAssembly[name] = (...args) => { calls.push(name); return originals[name](...args); };
  }
  try {
    const sharp = require("sharp");
    const input = await sharp({ create: { width: 2, height: 3, channels: 3, background: { r: 12, g: 34, b: 56 } } }).png().toBuffer();
    const inputMetadata = await sharp(input).metadata(), output = await sharp(input).resize(1, 1).png().toBuffer(), outputMetadata = await sharp(output).metadata();
    return { versions: sharp.versions,
      input: { width: inputMetadata.width, height: inputMetadata.height, format: inputMetadata.format },
      output: { width: outputMetadata.width, height: outputMetadata.height, format: outputMetadata.format, bytes: output.length },
      requireCache: Object.keys(require.cache).filter((path) => path.includes("sharp") || path.includes("emnapi")),
      sharedObjects: process.report.getReport().sharedObjects.filter((path) => path.includes("sharp") || path.includes("wasm") || path.includes("emnapi")), wasmCalls: calls };
  } finally { for (const [name, original] of Object.entries(originals)) WebAssembly[name] = original; }
}
function decideOptional(input) {
  if (input.environment.node !== "v22.23.2" || input.environment.npm !== "10.9.9") return { accepted: false, code: "TOOLCHAIN_MISMATCH" };
  if (input.environment.platform !== "linux") return { accepted: false, code: "OPTIONAL_TREE_PLATFORM_MISMATCH" };
  if (input.environment.arch !== "x64") return { accepted: false, code: "OPTIONAL_TREE_ARCH_MISMATCH" };
  if (input.environment.libc !== "glibc") return { accepted: false, code: "OPTIONAL_TREE_LIBC_MISMATCH" };
  if (!Number.isFinite(input.nowMs) || input.nowMs >= EXPIRES_AT_MS) return { accepted: false, code: "SECURITY_TOOLCHAIN_EXCEPTION_EXPIRED" };
  if (!input.tree.jsonValid || input.tree.rawExitCode !== 0) return { accepted: false, code: "OPTIONAL_TREE_JSON_INVALID" };
  if (input.tree.flags.some(({ flag }) => flag === "invalid") || input.tree.anomalies.some(({ type }) => type === "invalid")) return { accepted: false, code: "OPTIONAL_TREE_INVALID" };
  if (input.tree.flags.some(({ flag }) => flag === "missing") || input.tree.anomalies.some(({ type }) => type === "missing")) return { accepted: false, code: "OPTIONAL_TREE_MISSING" };
  if (input.tree.flags.some(({ flag }) => flag === "peerMissing") || input.tree.anomalies.some(({ type }) => type.includes("peer") && type.includes("missing"))) return { accepted: false, code: "OPTIONAL_TREE_PEER_MISSING" };
  const extras = input.tree.anomalies.filter(({ type }) => type === "extraneous").map(({ name, version }) => ({ name, version })).sort((a, b) => a.name.localeCompare(b.name));
  if (input.tree.anomalies.some(({ type }) => type !== "extraneous") || JSON.stringify(extras) !== JSON.stringify(EXPECTED_EXTRANEOUS))
    return { accepted: false, code: "OPTIONAL_TREE_ANOMALY_SET_MISMATCH" };
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) if (input.tree.roots[name]?.version !== expected.version || !input.tree.roots[name]?.extraneous)
    return { accepted: false, code: "OPTIONAL_TREE_VERSION_MISMATCH" };
  if (input.rootDeclarations.length) return { accepted: false, code: "OPTIONAL_TREE_ROOT_DECLARED" };
  if (Object.values(input.graph.reachableTargets).some(Boolean)) return { accepted: false, code: "OPTIONAL_TREE_REACHABLE" };
  if (input.graph.incoming["@img/sharp-wasm32"].length) return { accepted: false, code: "OPTIONAL_TREE_WASM_INSTALLED_PARENT_MISMATCH" };
  const incoming = input.graph.incoming["@emnapi/runtime"];
  if (incoming.length !== 1 || incoming[0].from !== "node_modules/@img/sharp-wasm32" || incoming[0].field !== "dependencies" ||
      incoming[0].spec !== "^1.11.3" || incoming[0].resolvedPath !== "node_modules/@emnapi/runtime") return { accepted: false, code: "OPTIONAL_TREE_RUNTIME_PARENT_MISMATCH" };
  if (input.lock.lockfileVersion !== 3) return { accepted: false, code: "OPTIONAL_TREE_LOCK_GRAPH_MISMATCH" };
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) { const record = input.lock.records[name];
    if (record?.version !== expected.version || record?.resolved !== expected.resolved || record?.integrity !== expected.integrity || record?.optional !== true)
      return { accepted: false, code: "OPTIONAL_TREE_LOCK_GRAPH_MISMATCH" }; }
  if (input.lock.records["@img/sharp-wasm32"]?.dependencies?.["@emnapi/runtime"] !== "^1.11.3" ||
      input.lock.sharp?.optionalDependencies?.["@img/sharp-webcontainers-wasm32"] !== "0.35.5" ||
      input.lock.sharpWebcontainers?.dependencies?.["@img/sharp-wasm32"] !== "0.35.5" || input.lock.sharpWebcontainers?.optional !== true ||
      JSON.stringify(input.lock.sharpWebcontainers?.cpu) !== JSON.stringify(["wasm32"]) ||
      input.lock.sharpFreebsd?.dependencies?.["@img/sharp-wasm32"] !== "0.35.5" || input.lock.sharpFreebsd?.optional !== true)
    return { accepted: false, code: "OPTIONAL_TREE_LOCK_GRAPH_MISMATCH" };
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) if (input.content[name]?.sha256 !== expected.contentHash || input.content[name]?.fileCount !== expected.fileCount)
    return { accepted: false, code: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH" };
  const forbidden = /sharp-wasm32|@emnapi[\\/]runtime/i;
  if (input.native.requireCache.some((path) => forbidden.test(path))) return { accepted: false, code: "OPTIONAL_TREE_FORBIDDEN_MODULE_LOADED" };
  if (input.native.sharedObjects.some((path) => forbidden.test(path)) || input.native.wasmCalls.length) return { accepted: false, code: "OPTIONAL_TREE_WASM_LOADED" };
  if (!input.native.requireCache.some((path) => /@img[\\/]sharp-linux-x64[\\/]index\.cjs$/.test(path)) ||
      !input.native.sharedObjects.some((path) => /@img[\\/]sharp-linux-x64[\\/].+\.node$/.test(path)) || input.native.versions?.sharp !== "0.35.5")
    return { accepted: false, code: "OPTIONAL_TREE_NATIVE_SHARP_NOT_LOADED" };
  if (input.native.input?.width !== 2 || input.native.input?.height !== 3 || input.native.input?.format !== "png" ||
      input.native.output?.width !== 1 || input.native.output?.height !== 1 || input.native.output?.format !== "png" || !(input.native.output?.bytes > 0))
    return { accepted: false, code: "OPTIONAL_TREE_SHARP_SMOKE_FAILED" };
  return { accepted: true, code: "OPTIONAL_TREE_EXCEPTION_ACCEPTED" };
}

function auditFixture() {
  return { production: { jsonValid: true, exitCode: 0, report: { metadata: { vulnerabilities: { high: 0, critical: 0, total: 0 } }, vulnerabilities: {} } },
    full: { jsonValid: true, exitCode: 1, report: { metadata: { vulnerabilities: { ...EXPECTED_FULL_COUNTS } }, vulnerabilities: {
      "@esbuild-kit/core-utils": { severity: "moderate", via: ["esbuild"], nodes: ["node_modules/@esbuild-kit/core-utils"] },
      "@esbuild-kit/esm-loader": { severity: "moderate", via: ["@esbuild-kit/core-utils"], nodes: ["node_modules/@esbuild-kit/esm-loader"] },
      "@next/eslint-plugin-next": { severity: "high", via: ["fast-glob"], nodes: ["node_modules/@next/eslint-plugin-next"] },
      "@vitest/mocker": { severity: "moderate", via: [{ name: "@vitest/mocker", severity: "moderate", url: "https://github.com/advisories/GHSA-82fw-gwwq-j7x9" }], nodes: ["node_modules/vitest/node_modules/@vitest/mocker"] },
      braces: { severity: "high", via: [{ name: "braces", severity: "high", url: `https://github.com/advisories/${ALLOWED_ADVISORY}` }], nodes: ["node_modules/braces"] },
      dompurify: { severity: "low", via: [{ name: "dompurify", severity: "low", url: "https://github.com/advisories/GHSA-p98j-92pf-mc4p" }], nodes: ["node_modules/dompurify"] },
      "drizzle-kit": { severity: "moderate", via: ["@esbuild-kit/esm-loader"], nodes: ["node_modules/drizzle-kit"] },
      esbuild: { severity: "moderate", via: [{ name: "esbuild", severity: "moderate", url: "https://github.com/advisories/GHSA-67mh-4wv8-2f99" }], nodes: ["node_modules/@esbuild-kit/core-utils/node_modules/esbuild"] },
      "eslint-config-next": { severity: "high", via: ["@next/eslint-plugin-next"], nodes: ["node_modules/eslint-config-next"] },
      "fast-glob": { severity: "high", via: ["micromatch"], nodes: ["node_modules/fast-glob"] },
      micromatch: { severity: "high", via: ["braces"], nodes: ["node_modules/micromatch"] },
      vitest: { severity: "moderate", via: ["@vitest/mocker", { name: "vitest", severity: "moderate", url: "https://github.com/advisories/GHSA-82fw-gwwq-j7x9" }], nodes: ["node_modules/vitest"] },
    } } },
    tree: { jsonValid: true, exitCode: 0, report: [{ name: "braces", version: "3.0.3", dev: true, dependents: [{ from: {
      name: "micromatch", version: "4.0.8", dependents: [{ from: { name: "fast-glob", version: "3.3.1", dependents: [{ from: {
        name: "@next/eslint-plugin-next", version: "16.3.4", dependents: [{ from: { name: "eslint-config-next", version: "16.3.4",
          dependents: [{ type: "dev", name: "eslint-config-next", spec: "16.3.4", from: { location: REPO_ROOT } }] } }], } }], } }], } }] }] },
    nowMs: Date.parse("2026-10-06T00:00:00Z") };
}
function optionalFixture() {
  return { environment: { node: "v22.23.2", npm: "10.9.9", platform: "linux", arch: "x64", libc: "glibc" }, nowMs: Date.parse("2026-10-06T00:00:00Z"),
    tree: { jsonValid: true, rawExitCode: 0, anomalies: EXPECTED_EXTRANEOUS.map((item) => ({ type: "extraneous", ...item })), flags: [],
      roots: Object.fromEntries(Object.entries(OPTIONAL_PACKAGES).map(([name, value]) => [name, { version: value.version, extraneous: true }])) },
    rootDeclarations: [], graph: { reachableTargets: { "@img/sharp-wasm32": false, "@emnapi/runtime": false }, incoming: {
      "@img/sharp-wasm32": [], "@emnapi/runtime": [{ from: "node_modules/@img/sharp-wasm32", field: "dependencies", spec: "^1.11.3", resolvedPath: "node_modules/@emnapi/runtime" }] } },
    lock: { lockfileVersion: 3, records: {
      "@img/sharp-wasm32": { ...OPTIONAL_PACKAGES["@img/sharp-wasm32"], optional: true, dependencies: { "@emnapi/runtime": "^1.11.3" } },
      "@emnapi/runtime": { ...OPTIONAL_PACKAGES["@emnapi/runtime"], optional: true, dependencies: { tslib: "^2.4.0" } } },
      sharp: { optionalDependencies: { "@img/sharp-webcontainers-wasm32": "0.35.5" } },
      sharpWebcontainers: { optional: true, cpu: ["wasm32"], dependencies: { "@img/sharp-wasm32": "0.35.5" } },
      sharpFreebsd: { optional: true, dependencies: { "@img/sharp-wasm32": "0.35.5" } } },
    content: Object.fromEntries(Object.entries(OPTIONAL_PACKAGES).map(([name, value]) => [name, { sha256: value.contentHash, fileCount: value.fileCount }])),
    native: { requireCache: ["/repo/node_modules/@img/sharp-linux-x64/index.cjs"],
      sharedObjects: ["/repo/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node"], wasmCalls: [], versions: { sharp: "0.35.5" },
      input: { width: 2, height: 3, format: "png" }, output: { width: 1, height: 1, format: "png", bytes: 90 } } };
}
function runSelfTest() {
  const tests = [];
  function runCase(name, factory, mutate, decide, expectedCode) { const input = factory(); mutate(input); const decision = decide(input);
    tests.push({ name, expectedCode, actualCode: decision.code, passed: !decision.accepted && decision.code === expectedCode }); }
  for (const [name, decision, code] of [["accept-security-exception", decideSecurity(auditFixture()), "SECURITY_EXCEPTION_ACCEPTED"],
    ["accept-optional-tree-exception", decideOptional(optionalFixture()), "OPTIONAL_TREE_EXCEPTION_ACCEPTED"]])
    tests.push({ name, expectedCode: code, actualCode: decision.code, passed: decision.accepted && decision.code === code });
  const optionalCases = [
    ["reject-third-extraneous", (x) => x.tree.anomalies.push({ type: "extraneous", name: "third", version: "1" }), "OPTIONAL_TREE_ANOMALY_SET_MISMATCH"],
    ["reject-wasm-version", (x) => { x.tree.roots["@img/sharp-wasm32"].version = "0.35.6"; }, "OPTIONAL_TREE_VERSION_MISMATCH"],
    ["reject-runtime-version", (x) => { x.tree.roots["@emnapi/runtime"].version = "1.11.4"; }, "OPTIONAL_TREE_VERSION_MISMATCH"],
    ["reject-content-hash", (x) => { x.content["@img/sharp-wasm32"].sha256 = "0".repeat(64); }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-platform", (x) => { x.environment.platform = "darwin"; }, "OPTIONAL_TREE_PLATFORM_MISMATCH"],
    ["reject-arch", (x) => { x.environment.arch = "arm64"; }, "OPTIONAL_TREE_ARCH_MISMATCH"],
    ["reject-libc", (x) => { x.environment.libc = "musl"; }, "OPTIONAL_TREE_LIBC_MISMATCH"],
    ["reject-root-declaration", (x) => x.rootDeclarations.push({ field: "dependencies", name: "@img/sharp-wasm32" }), "OPTIONAL_TREE_ROOT_DECLARED"],
    ["reject-reachable", (x) => { x.graph.reachableTargets["@img/sharp-wasm32"] = true; }, "OPTIONAL_TREE_REACHABLE"],
    ["reject-invalid", (x) => x.tree.flags.push({ flag: "invalid", path: "root>x" }), "OPTIONAL_TREE_INVALID"],
    ["reject-missing", (x) => x.tree.flags.push({ flag: "missing", path: "root>x" }), "OPTIONAL_TREE_MISSING"],
    ["reject-peer-missing", (x) => x.tree.flags.push({ flag: "peerMissing", path: "root>x" }), "OPTIONAL_TREE_PEER_MISSING"],
    ["reject-wasm-load", (x) => x.native.wasmCalls.push("instantiate"), "OPTIONAL_TREE_WASM_LOADED"],
    ["reject-runtime-load", (x) => x.native.requireCache.push("/repo/node_modules/@emnapi/runtime/index.js"), "OPTIONAL_TREE_FORBIDDEN_MODULE_LOADED"],
    ["reject-lock-drift", (x) => { x.lock.records["@img/sharp-wasm32"].integrity = "drift"; }, "OPTIONAL_TREE_LOCK_GRAPH_MISMATCH"],
    ["reject-parent-drift", (x) => { x.graph.incoming["@emnapi/runtime"][0].from = "other"; }, "OPTIONAL_TREE_RUNTIME_PARENT_MISMATCH"],
    ["reject-toolchain-expiry", (x) => { x.nowMs = EXPIRES_AT_MS; }, "SECURITY_TOOLCHAIN_EXCEPTION_EXPIRED"],
  ];
  for (const [name, mutate, code] of optionalCases) runCase(name, optionalFixture, mutate, decideOptional, code);
  const securityCases = [
    ["reject-production-high", (x) => { x.production.exitCode = 1; x.production.report.metadata.vulnerabilities.high = 1; x.production.report.vulnerabilities.production = { severity: "high", via: [], nodes: [] }; }, "PRODUCTION_HIGH_CRITICAL"],
    ["reject-braces-advisory", (x) => { x.full.report.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-aaaa-bbbb-cccc"; }, "UNEXPECTED_HIGH_CRITICAL"],
    ["reject-braces-version", (x) => { x.tree.report[0].version = "3.0.4"; }, "SECURITY_EXCEPTION_CHAIN_MISMATCH"],
    ["reject-braces-parent", (x) => { x.tree.report[0].dependents[0].from.name = "other"; }, "SECURITY_EXCEPTION_CHAIN_MISMATCH"],
    ["reject-braces-production", (x) => { x.tree.report[0].dev = false; }, "SECURITY_EXCEPTION_CHAIN_MISMATCH"],
    ["reject-new-advisory", (x) => { x.full.report.vulnerabilities.unexpected = { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }], nodes: [] }; x.full.report.metadata.vulnerabilities.high = 6; x.full.report.metadata.vulnerabilities.total = 6; }, "UNEXPECTED_HIGH_CRITICAL"],
    ["reject-new-low-advisory", (x) => { x.full.report.vulnerabilities["unexpected-low"] = { severity: "low", via: [{ url: "https://github.com/advisories/GHSA-dddd-eeee-ffff" }], nodes: ["node_modules/unexpected-low"] }; x.full.report.metadata.vulnerabilities.low = 2; x.full.report.metadata.vulnerabilities.total = 13; }, "FULL_AUDIT_ADVISORY_SET_MISMATCH"],
    ["reject-new-moderate-advisory", (x) => { x.full.report.vulnerabilities["unexpected-moderate"] = { severity: "moderate", via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }], nodes: ["node_modules/unexpected-moderate"] }; x.full.report.metadata.vulnerabilities.moderate = 7; x.full.report.metadata.vulnerabilities.total = 13; }, "FULL_AUDIT_ADVISORY_SET_MISMATCH"],
    ["reject-unresolved-advisory", (x) => { x.full.report.vulnerabilities.dompurify.via = ["missing-vulnerability"]; }, "FULL_AUDIT_UNRESOLVED_ADVISORY"],
    ["reject-severity-drift", (x) => { x.full.report.vulnerabilities.dompurify.severity = "moderate"; }, "FULL_AUDIT_MAPPING_MISMATCH"],
    ["reject-node-drift", (x) => { x.full.report.vulnerabilities.dompurify.nodes.push("node_modules/other-dompurify"); }, "FULL_AUDIT_MAPPING_MISMATCH"],
    ["reject-security-expiry", (x) => { x.nowMs = EXPIRES_AT_MS; }, "SECURITY_EXCEPTION_EXPIRED"],
  ];
  for (const [name, mutate, code] of securityCases) runCase(name, auditFixture, mutate, decideSecurity, code);
  const passed = tests.every((test) => test.passed);
  process.stdout.write(`${JSON.stringify({ policyVersion: POLICY_VERSION, mode: "self-test", decision: { accepted: passed, code: passed ? "SELF_TEST_PASSED" : "SELF_TEST_FAILED" }, tests }, null, 2)}\n`);
  return passed ? 0 : 1;
}
async function normalEvidence() {
  const npmVersion = runCommand("npm", ["--version"]), treeResult = parseJsonCommand(runCommand("npm", ["ls", "--all", "--json"]));
  const productionResult = parseJsonCommand(runCommand("npm", ["audit", "--omit=dev", "--audit-level=high", "--json"]));
  const fullResult = parseJsonCommand(runCommand("npm", ["audit", "--audit-level=high", "--json"]));
  const explainResult = parseJsonCommand(runCommand("npm", ["explain", "braces", "--json"])), nowMs = Date.now();
  const rootManifest = JSON.parse(await readFile(resolve(REPO_ROOT, "package.json"), "utf8"));
  const lockfile = JSON.parse(await readFile(resolve(REPO_ROOT, "package-lock.json"), "utf8")), packages = await scanInstalledPackages();
  const rootDeclarations = [];
  for (const field of DECLARATION_FIELDS) for (const name of Object.keys(OPTIONAL_PACKAGES)) if (rootManifest[field]?.[name] !== undefined)
    rootDeclarations.push({ field, name, spec: rootManifest[field][name] });
  const content = {};
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) try { content[name] = await packageContentHash(resolve(REPO_ROOT, expected.path)); }
    catch (error) { content[name] = { error: error instanceof Error ? error.message : String(error) }; }
  const report = process.report.getReport(), environment = { node: process.version,
    npm: npmVersion.exitCode === 0 ? npmVersion.stdout.trim() : null, platform: process.platform, arch: process.arch,
    libc: report.header.glibcVersionRuntime ? "glibc" : "unknown", glibcVersionRuntime: report.header.glibcVersionRuntime ?? null };
  const optionalInput = { environment, nowMs, tree: inspectTree(treeResult), rootDeclarations,
    graph: inspectInstalledGraph(rootManifest, packages), lock: inspectLock(lockfile), content, native: await runSharpSmoke() };
  const production = { jsonValid: productionResult.jsonValid, exitCode: productionResult.exitCode, report: productionResult.parsed };
  const full = { jsonValid: fullResult.jsonValid, exitCode: fullResult.exitCode, report: fullResult.parsed };
  const securityTree = { jsonValid: explainResult.jsonValid, exitCode: explainResult.exitCode, report: explainResult.parsed };
  const securityDecision = decideSecurity({ production, full, tree: securityTree, nowMs }), optionalDecision = decideOptional(optionalInput);
  return { policyVersion: POLICY_VERSION, generatedAt: new Date(nowMs).toISOString(), expiresAt: EXPIRES_AT, environment,
    optionalTree: { command: treeResult.command, rawExitCode: treeResult.exitCode, stderr: treeResult.stderr, jsonValid: treeResult.jsonValid,
      report: treeResult.parsed, rawStdout: treeResult.jsonValid ? undefined : treeResult.stdout, validation: optionalInput, decision: optionalDecision },
    security: { advisory: ALLOWED_ADVISORY,
      production: { command: productionResult.command, rawExitCode: productionResult.exitCode, stderr: productionResult.stderr, jsonValid: productionResult.jsonValid, summary: productionResult.jsonValid ? makeAuditSummary(productionResult.parsed) : null, report: productionResult.parsed },
      full: { command: fullResult.command, rawExitCode: fullResult.exitCode, stderr: fullResult.stderr, jsonValid: fullResult.jsonValid, summary: fullResult.jsonValid ? makeAuditSummary(fullResult.parsed) : null, report: fullResult.parsed },
      dependencyTree: { command: explainResult.command, rawExitCode: explainResult.exitCode, stderr: explainResult.stderr, jsonValid: explainResult.jsonValid, validation: explainResult.jsonValid ? inspectExceptionChain(explainResult.parsed) : null, report: explainResult.parsed }, decision: securityDecision },
    decision: optionalDecision.accepted && securityDecision.accepted ? { accepted: true, code: "OPTIONAL_TREE_EXCEPTION_ACCEPTED" }
      : !optionalDecision.accepted ? optionalDecision : securityDecision };
}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--self-test") process.exitCode = runSelfTest();
else if (args.length) { process.stdout.write(`${JSON.stringify({ policyVersion: POLICY_VERSION, decision: { accepted: false, code: "USAGE_ERROR" }, usage: "node scripts/audit-security-policy.mjs [--self-test]" })}\n`); process.exitCode = 2; }
else { const evidence = await normalEvidence(); process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`); process.exitCode = evidence.decision.accepted ? 0 : 1; }
