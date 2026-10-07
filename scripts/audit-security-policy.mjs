#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_VERSION = "isme-security-policy-v6-mode-only";
const ALLOWED_ADVISORY = "GHSA-vfj7-8cjw-p6xm";
const EXPIRES_AT = "2026-10-19T00:00:00+08:00";
const EXPIRES_AT_MS = Date.parse(EXPIRES_AT);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_HIGH_CRITICAL = ["@next/eslint-plugin-next", "braces", "eslint-config-next", "fast-glob", "micromatch"];
const EXPECTED_FULL_COUNTS = { info: 0, low: 0, moderate: 6, high: 5, critical: 0, total: 11 };
const EXPECTED_FULL_ADVISORIES = [
  "GHSA-67mh-4wv8-2f99", "GHSA-82fw-gwwq-j7x9", "GHSA-vfj7-8cjw-p6xm",
];
const EXPECTED_FULL_VULNERABILITIES = [
  { name: "@esbuild-kit/core-utils", severity: "moderate", advisories: ["GHSA-67mh-4wv8-2f99"], nodes: ["node_modules/@esbuild-kit/core-utils"] },
  { name: "@esbuild-kit/esm-loader", severity: "moderate", advisories: ["GHSA-67mh-4wv8-2f99"], nodes: ["node_modules/@esbuild-kit/esm-loader"] },
  { name: "@next/eslint-plugin-next", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/@next/eslint-plugin-next"] },
  { name: "@vitest/mocker", severity: "moderate", advisories: ["GHSA-82fw-gwwq-j7x9"], nodes: ["node_modules/vitest/node_modules/@vitest/mocker"] },
  { name: "braces", severity: "high", advisories: [ALLOWED_ADVISORY], nodes: ["node_modules/braces"] },
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
    semanticManifestHash: "f62d16c92463bdfd4e52c9ced0332255cd7c79ac991b936a72c870a2ff60a085",
    rawManifestHashByUmask: {
      "0002": "ef50ac3aa3dd410b42f38b44058db5a38acb26c45b8193b1546369840fffc32d",
      "0022": "db5fb294bbfdbac3042c7289f474d0bb1110054340a03b41d6b7f3ac65f0fe3b",
    }, fileCount: 17,
  },
  "@img/sharp-wasm32": {
    path: "node_modules/@img/sharp-wasm32", version: "0.35.5",
    resolved: "https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.35.5.tgz",
    integrity: "sha512-Ptsga1su4tQx+LLF1ECS9U6nz5kmrXKo6XVbtR48Ke3ZRxxgaWBu7IDtEe1quo8hiupwm6WFqxVlXaSf7IINGQ==",
    semanticManifestHash: "2b2f5193ad97638aacfba7a8fe9f73e57df310e28768365fbc1fdedeac685e6b",
    rawManifestHashByUmask: {
      "0002": "1d5b06e61e4f1a8191c119daf8bb1c6bc0b1e7be8f6197453239b968372cdc3b",
      "0022": "19c8a228816b4c6ec46c938b2ebd667714a11fcc8322c27ee81638474dfe563b",
    }, fileCount: 7,
  },
};
const EXPECTED_EXTRANEOUS = Object.entries(OPTIONAL_PACKAGES)
  .map(([name, value]) => ({ name, version: value.version })).sort((a, b) => a.name.localeCompare(b.name));
const DECLARATION_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const DIAGNOSTIC_CONFIG_KEYS = [
  "cache", "prefix", "install-strategy", "legacy-peer-deps", "omit", "include", "ignore-scripts",
  "foreground-scripts", "bin-links", "platform", "arch", "libc",
];
const UNSAFE_SYMLINK_TARGET = "<UNSAFE_SYMLINK_TARGET>";
const NORMALIZED_MODE_RULE = "regular executable=>0755; regular non-executable=>0644; symlink=>0777";
const DIAGNOSTIC_VALUE_MAX_BYTES = 4096;
const DIAGNOSTIC_MAX_DECODE_DEPTH = 3;

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? REPO_ROOT, env: options.env ?? process.env,
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
function diagnosticError(code) { const error = new Error(code); error.code = code; return error; }
function decodeUtf8(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  let decoded;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw diagnosticError("DIAGNOSTIC_PATH_NOT_UTF8"); }
  if (!Buffer.from(decoded, "utf8").equals(bytes)) throw diagnosticError("DIAGNOSTIC_PATH_NOT_UTF8");
  return decoded;
}
function validatePackageRelativePath(path) {
  if (typeof path !== "string" || !path || path.includes("\0") || Buffer.from(path, "utf8").toString("utf8") !== path ||
      path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path))
    throw diagnosticError("DIAGNOSTIC_PATH_INVALID");
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw diagnosticError("DIAGNOSTIC_PATH_INVALID");
  return path;
}
const fourDigitMode = (mode) => (mode & 0o7777).toString(8).padStart(4, "0");
function normalizedMode(type, mode) {
  if (type === "regular") return mode & 0o111 ? "0755" : "0644";
  if (type === "symlink") return "0777";
  throw diagnosticError("DIAGNOSTIC_TYPE_UNSUPPORTED");
}
function withinRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}
function safeSymlinkTarget(root, packagePath, target) {
  if (typeof target !== "string" || !target || target.includes("\0") || Buffer.from(target, "utf8").toString("utf8") !== target ||
      target.startsWith("/") || target.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(target))
    return { safe: false, value: UNSAFE_SYMLINK_TARGET };
  const destination = resolve(dirname(resolve(root, packagePath)), target);
  return withinRoot(root, destination) ? { safe: true, value: target } : { safe: false, value: UNSAFE_SYMLINK_TARGET };
}
async function packageDiagnosticManifest(packageName, root) {
  const manifest = [], errors = [];
  async function walk(directory, parentParts = []) {
    const children = (await readdir(directory, { withFileTypes: true, encoding: "buffer" }))
      .sort((a, b) => Buffer.compare(a.name, b.name));
    for (const child of children) {
      let name;
      try { name = decodeUtf8(child.name); }
      catch (error) { errors.push({ package: packageName, code: error.code ?? "DIAGNOSTIC_PATH_NOT_UTF8" }); continue; }
      if (name === "node_modules" && child.isDirectory()) continue;
      const parts = [...parentParts, name], packagePath = parts.join("/");
      try { validatePackageRelativePath(packagePath); }
      catch (error) { errors.push({ package: packageName, code: error.code ?? "DIAGNOSTIC_PATH_INVALID" }); continue; }
      const absolutePath = resolve(directory, name);
      if (!withinRoot(root, absolutePath)) { errors.push({ package: packageName, code: "DIAGNOSTIC_PATH_ESCAPE" }); continue; }
      const stats = await lstat(absolutePath);
      if (stats.isDirectory()) { await walk(absolutePath, parts); continue; }
      if (stats.isFile()) {
        manifest.push({ package: packageName, path: packagePath, type: "regular", size: stats.size,
          rawMode: fourDigitMode(stats.mode), normalizedMode: normalizedMode("regular", stats.mode),
          sha256: sha256(await readFile(absolutePath)) });
        continue;
      }
      if (stats.isSymbolicLink()) {
        let target;
        try { target = decodeUtf8(await readlink(absolutePath, { encoding: "buffer" })); }
        catch { target = null; }
        const safeTarget = safeSymlinkTarget(root, packagePath, target);
        if (!safeTarget.safe) errors.push({ package: packageName, code: "DIAGNOSTIC_SYMLINK_TARGET_UNSAFE" });
        manifest.push({ package: packageName, path: packagePath, type: "symlink", size: stats.size,
          rawMode: fourDigitMode(stats.mode), normalizedMode: normalizedMode("symlink", stats.mode),
          symlinkTarget: safeTarget.value });
        continue;
      }
      errors.push({ package: packageName, code: "DIAGNOSTIC_TYPE_UNSUPPORTED" });
    }
  }
  await walk(root);
  manifest.sort((a, b) => utf8Compare(a.package, b.package) || utf8Compare(a.path, b.path));
  errors.sort((a, b) => utf8Compare(a.package, b.package) || utf8Compare(a.code, b.code));
  return { manifest, errors };
}
function validateDiagnosticConfigKeys(keys) {
  if (!Array.isArray(keys) || keys.length !== DIAGNOSTIC_CONFIG_KEYS.length ||
      keys.some((key, index) => key !== DIAGNOSTIC_CONFIG_KEYS[index])) throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_KEY_NOT_ALLOWED");
  return keys;
}
function assertNoSensitiveDiagnosticPath(value, decoder = decodeURIComponent) {
  const unsafe = () => { throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE"); };
  const inspect = (candidate) => {
    if (typeof candidate !== "string" || Buffer.byteLength(candidate, "utf8") > DIAGNOSTIC_VALUE_MAX_BYTES ||
        /[\u0000-\u001f\u007f-\u009f]/u.test(candidate) || /%(?![0-9a-f]{2})/i.test(candidate) ||
        /%(?:2f|5c)/i.test(candidate)) unsafe();
    const normalized = candidate.replaceAll("\\", "/");
    if (/(?:^|\/)[a-z][a-z0-9+.-]*:\/{1,2}[^\/\s]*@[^\/\s]+/i.test(normalized) ||
        /(?:^|\/)[^\/\s:@]+:[^\/\s@]+@[^\/\s]+(?:\/|$)/.test(normalized) ||
        /(?:^|[^a-z0-9])(?:access[-_]?token|auth[-_]?token|token|password|passwd|secret|credential|authorization|bearer|api[-_]?key|private[-_]?key|proxy)(?:[^a-z0-9]|$)/i.test(normalized) ||
        /(?:gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|npm_[a-z0-9]{20,}|sk-[a-z0-9_-]{16,})/i.test(normalized)) unsafe();
  };
  let current = value;
  inspect(current);
  for (let depth = 1; depth <= DIAGNOSTIC_MAX_DECODE_DEPTH; depth += 1) {
    if (!current.includes("%")) return;
    let decoded;
    try { decoded = decoder(current); } catch { unsafe(); }
    if (typeof decoded !== "string" || Buffer.byteLength(decoded, "utf8") > Buffer.byteLength(current, "utf8")) unsafe();
    current = decoded;
    inspect(current);
  }
  if (current.includes("%")) {
    let next;
    try { next = decoder(current); } catch { unsafe(); }
    if (next !== current) unsafe();
  }
}
function redactDiagnosticPath(value, roots) {
  assertNoSensitiveDiagnosticPath(value);
  if (!value) return value;
  const candidates = roots.filter(({ path }) => typeof path === "string" && path.startsWith("/"))
    .sort((a, b) => b.path.length - a.path.length);
  for (const candidate of candidates) {
    const rel = relative(candidate.path, value);
    if (rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`))) {
      const suffix = rel ? `/${validatePackageRelativePath(rel.split(sep).join("/"))}` : "";
      assertNoSensitiveDiagnosticPath(suffix);
      const redacted = `${candidate.placeholder}${suffix}`;
      assertNoSensitiveDiagnosticPath(redacted);
      return redacted;
    }
  }
  if (value.startsWith("/")) return "<ABSOLUTE_PATH>";
  const redacted = validatePackageRelativePath(value);
  assertNoSensitiveDiagnosticPath(redacted);
  return redacted;
}
function sanitizeDiagnosticConfigValue(key, value, roots) {
  if (["cache", "prefix"].includes(key)) return redactDiagnosticPath(value, roots);
  if (typeof value !== "string" || value.includes("\n") || value.includes("\r") || value.includes("://") ||
      /token|password|cookie|credential|authorization|proxy/i.test(value)) throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE");
  if (key === "install-strategy" && !["hoisted", "nested", "shallow", "linked"].includes(value))
    throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_INVALID");
  if (["legacy-peer-deps", "ignore-scripts", "foreground-scripts", "bin-links"].includes(key) && !["true", "false"].includes(value))
    throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_INVALID");
  if (["omit", "include"].includes(key) && !/^(?:|dev|optional|peer|prod)(?:,(?:dev|optional|peer|prod))*$/.test(value))
    throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_INVALID");
  if (["platform", "arch", "libc"].includes(key) && !/^(?:undefined|null|[a-z0-9._-]+)$/i.test(value))
    throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_INVALID");
  return value;
}
function readSafeNpmConfig(keys = DIAGNOSTIC_CONFIG_KEYS, commandRunner = runCommand, rawConfig = process.env) {
  validateDiagnosticConfigKeys(keys);
  const roots = [
    { placeholder: "<WORKSPACE>", path: REPO_ROOT },
    { placeholder: "<RUNNER_TEMP>", path: process.env.RUNNER_TEMP },
    { placeholder: "<HOME>", path: process.env.HOME },
  ];
  const config = {};
  for (const key of keys) {
    if (["cache", "prefix"].includes(key)) for (const rawKey of [`npm_config_${key}`, `NPM_CONFIG_${key.toUpperCase()}`])
      if (typeof rawConfig?.[rawKey] === "string") assertNoSensitiveDiagnosticPath(rawConfig[rawKey]);
    const result = commandRunner("npm", ["config", "get", key]);
    if (result.exitCode !== 0 || result.error) throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_READ_FAILED");
    const value = result.stdout.replace(/(?:\r?\n)$/, "");
    config[key] = sanitizeDiagnosticConfigValue(key, value, roots);
  }
  return config;
}
function attachContentHashDiagnostic(evidence, diagnostic) {
  if (evidence.decision?.code !== "OPTIONAL_TREE_CONTENT_HASH_MISMATCH") return evidence;
  return { ...evidence, diagnostic };
}
const evidenceExitCode = (evidence) => evidence.decision?.accepted === true ? 0 : 1;
async function buildContentHashDiagnostic(environment, configReader = readSafeNpmConfig) {
  let npmConfig;
  try { npmConfig = configReader(); }
  catch (error) {
    return { schema: "optional-tree-content-manifest-v1", reason: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH", valid: false,
      npmConfig: null, errors: [{ package: "<environment>", code: error.code ?? "DIAGNOSTIC_NPM_CONFIG_READ_FAILED" }] };
  }
  const manifest = [], errors = [];
  for (const [packageName, expected] of Object.entries(OPTIONAL_PACKAGES).sort(([a], [b]) => utf8Compare(a, b))) {
    try {
      const result = await packageDiagnosticManifest(packageName, resolve(REPO_ROOT, expected.path));
      manifest.push(...result.manifest); errors.push(...result.errors);
    } catch (error) { errors.push({ package: packageName, code: error.code ?? "DIAGNOSTIC_MANIFEST_READ_FAILED" }); }
  }
  errors.sort((a, b) => utf8Compare(a.package, b.package) || utf8Compare(a.code, b.code));
  return { schema: "optional-tree-content-manifest-v1", reason: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH",
    valid: errors.length === 0, normalizedModeRule: NORMALIZED_MODE_RULE,
    environment: { node: environment.node, npm: environment.npm, platform: environment.platform,
      arch: environment.arch, libc: environment.libc, umask: fourDigitMode(process.umask()) },
    npmConfig, manifest, errors };
}
function contentManifestHashes(entries) {
  const semanticEntries = entries.map(({ rawMode: _rawMode, ...entry }) => entry);
  return { semanticSha256: sha256(canonical(semanticEntries)), rawSha256: sha256(canonical(entries)) };
}
async function packageContentHash(packageName, root) {
  const result = await packageDiagnosticManifest(packageName, root);
  if (result.errors.length) throw diagnosticError(result.errors[0].code);
  const entries = result.manifest.map(({ package: _package, ...entry }) => entry);
  return { algorithm: "canonical-json-sha256-v1", fileCount: entries.length,
    symlinkCount: entries.filter(({ type }) => type === "symlink").length,
    umask: fourDigitMode(process.umask()), ...contentManifestHashes(entries) };
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
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) { const content = input.content[name];
    if (content?.semanticSha256 !== expected.semanticManifestHash || content?.fileCount !== expected.fileCount || content?.symlinkCount !== 0)
      return { accepted: false, code: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH" };
    if (content?.rawSha256 !== expected.rawManifestHashByUmask?.[content?.umask])
      return { accepted: false, code: "OPTIONAL_TREE_RAW_MODE_MISMATCH" }; }
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
    content: Object.fromEntries(Object.entries(OPTIONAL_PACKAGES).map(([name, value]) => [name, {
      semanticSha256: value.semanticManifestHash, rawSha256: value.rawManifestHashByUmask["0002"],
      fileCount: value.fileCount, symlinkCount: 0, umask: "0002",
    }])),
    native: { requireCache: ["/repo/node_modules/@img/sharp-linux-x64/index.cjs"],
      sharedObjects: ["/repo/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node"], wasmCalls: [], versions: { sharp: "0.35.5" },
      input: { width: 2, height: 3, format: "png" }, output: { width: 1, height: 1, format: "png", bytes: 90 } } };
}
async function runSelfTest() {
  const tests = [];
  function runCase(name, factory, mutate, decide, expectedCode) { const input = factory(); mutate(input); const decision = decide(input);
    tests.push({ name, expectedCode, actualCode: decision.code, passed: !decision.accepted && decision.code === expectedCode }); }
  const hostedModeFixture = optionalFixture();
  for (const [name, value] of Object.entries(OPTIONAL_PACKAGES)) {
    hostedModeFixture.content[name].umask = "0022";
    hostedModeFixture.content[name].rawSha256 = value.rawManifestHashByUmask["0022"];
  }
  for (const [name, decision, code] of [["accept-security-exception", decideSecurity(auditFixture()), "SECURITY_EXCEPTION_ACCEPTED"],
    ["accept-optional-tree-exception", decideOptional(optionalFixture()), "OPTIONAL_TREE_EXCEPTION_ACCEPTED"],
    ["accept-hosted-mode-only-exception", decideOptional(hostedModeFixture), "OPTIONAL_TREE_EXCEPTION_ACCEPTED"]])
    tests.push({ name, expectedCode: code, actualCode: decision.code, passed: decision.accepted && decision.code === code });
  const optionalCases = [
    ["reject-third-extraneous", (x) => x.tree.anomalies.push({ type: "extraneous", name: "third", version: "1" }), "OPTIONAL_TREE_ANOMALY_SET_MISMATCH"],
    ["reject-wasm-version", (x) => { x.tree.roots["@img/sharp-wasm32"].version = "0.35.6"; }, "OPTIONAL_TREE_VERSION_MISMATCH"],
    ["reject-runtime-version", (x) => { x.tree.roots["@emnapi/runtime"].version = "1.11.4"; }, "OPTIONAL_TREE_VERSION_MISMATCH"],
    ["reject-content-hash", (x) => { x.content["@img/sharp-wasm32"].semanticSha256 = "0".repeat(64); }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-content-size", (x) => { x.content["@img/sharp-wasm32"].semanticSha256 = "1".repeat(64); }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-content-path", (x) => { x.content["@img/sharp-wasm32"].semanticSha256 = "2".repeat(64); }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-content-kind", (x) => { x.content["@img/sharp-wasm32"].semanticSha256 = "3".repeat(64); }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-normalized-mode", (x) => { x.content["@img/sharp-wasm32"].semanticSha256 = "4".repeat(64); }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-added-or-removed-entry", (x) => { x.content["@img/sharp-wasm32"].fileCount += 1; }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-symlink-entry", (x) => { x.content["@img/sharp-wasm32"].symlinkCount = 1; }, "OPTIONAL_TREE_CONTENT_HASH_MISMATCH"],
    ["reject-unapproved-raw-mode", (x) => { x.content["@img/sharp-wasm32"].rawSha256 = "5".repeat(64); }, "OPTIONAL_TREE_RAW_MODE_MISMATCH"],
    ["reject-unapproved-umask", (x) => { x.content["@img/sharp-wasm32"].umask = "0077"; }, "OPTIONAL_TREE_RAW_MODE_MISMATCH"],
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
  const manifestEntry = { path: "file.bin", type: "regular", size: 4, normalizedMode: "0644",
    sha256: "a".repeat(64), rawMode: "0664" };
  const baselineManifestHashes = contentManifestHashes([manifestEntry]);
  const hostedManifestHashes = contentManifestHashes([{ ...manifestEntry, rawMode: "0644" }]);
  tests.push({ name: "mode-only-keeps-semantic-hash", expectedCode: "SEMANTIC_EQUAL_RAW_DIFFERENT",
    actualCode: baselineManifestHashes.semanticSha256 === hostedManifestHashes.semanticSha256 &&
      baselineManifestHashes.rawSha256 !== hostedManifestHashes.rawSha256 ? "SEMANTIC_EQUAL_RAW_DIFFERENT" : "HASH_INVARIANT_FAILED",
    passed: baselineManifestHashes.semanticSha256 === hostedManifestHashes.semanticSha256 &&
      baselineManifestHashes.rawSha256 !== hostedManifestHashes.rawSha256 });
  const semanticManifestMutations = [
    ["path", [{ ...manifestEntry, path: "other.bin" }]],
    ["kind", [{ ...manifestEntry, type: "symlink", symlinkTarget: "file.bin" }]],
    ["size", [{ ...manifestEntry, size: 5 }]],
    ["bytes", [{ ...manifestEntry, sha256: "b".repeat(64) }]],
    ["normalized-mode", [{ ...manifestEntry, normalizedMode: "0755" }]],
    ["added", [manifestEntry, { ...manifestEntry, path: "second.bin" }]],
    ["removed", []],
  ];
  for (const [field, entries] of semanticManifestMutations) {
    const changed = contentManifestHashes(entries).semanticSha256;
    tests.push({ name: `mode-only-rejects-${field}-drift`, expectedCode: "SEMANTIC_HASH_CHANGED",
      actualCode: changed === baselineManifestHashes.semanticSha256 ? "SEMANTIC_HASH_UNCHANGED" : "SEMANTIC_HASH_CHANGED",
      passed: changed !== baselineManifestHashes.semanticSha256 });
  }
  const securityCases = [
    ["reject-production-high", (x) => { x.production.exitCode = 1; x.production.report.metadata.vulnerabilities.high = 1; x.production.report.vulnerabilities.production = { severity: "high", via: [], nodes: [] }; }, "PRODUCTION_HIGH_CRITICAL"],
    ["reject-braces-advisory", (x) => { x.full.report.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-aaaa-bbbb-cccc"; }, "UNEXPECTED_HIGH_CRITICAL"],
    ["reject-braces-version", (x) => { x.tree.report[0].version = "3.0.4"; }, "SECURITY_EXCEPTION_CHAIN_MISMATCH"],
    ["reject-braces-parent", (x) => { x.tree.report[0].dependents[0].from.name = "other"; }, "SECURITY_EXCEPTION_CHAIN_MISMATCH"],
    ["reject-braces-production", (x) => { x.tree.report[0].dev = false; }, "SECURITY_EXCEPTION_CHAIN_MISMATCH"],
    ["reject-new-advisory", (x) => { x.full.report.vulnerabilities.unexpected = { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }], nodes: [] }; x.full.report.metadata.vulnerabilities.high = 6; x.full.report.metadata.vulnerabilities.total = 6; }, "UNEXPECTED_HIGH_CRITICAL"],
    ["reject-new-low-advisory", (x) => { x.full.report.vulnerabilities["unexpected-low"] = { severity: "low", via: [{ url: "https://github.com/advisories/GHSA-dddd-eeee-ffff" }], nodes: ["node_modules/unexpected-low"] }; x.full.report.metadata.vulnerabilities.low = 2; x.full.report.metadata.vulnerabilities.total = 13; }, "FULL_AUDIT_ADVISORY_SET_MISMATCH"],
    ["reject-dompurify-advisory-regression", (x) => { x.full.report.vulnerabilities.dompurify = { severity: "low", via: [{ url: "https://github.com/advisories/GHSA-p98j-92pf-mc4p" }], nodes: ["node_modules/dompurify"] }; x.full.report.metadata.vulnerabilities.low = 1; x.full.report.metadata.vulnerabilities.total = 12; }, "FULL_AUDIT_ADVISORY_SET_MISMATCH"],
    ["reject-new-moderate-advisory", (x) => { x.full.report.vulnerabilities["unexpected-moderate"] = { severity: "moderate", via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }], nodes: ["node_modules/unexpected-moderate"] }; x.full.report.metadata.vulnerabilities.moderate = 7; x.full.report.metadata.vulnerabilities.total = 13; }, "FULL_AUDIT_ADVISORY_SET_MISMATCH"],
    ["reject-unresolved-advisory", (x) => { x.full.report.vulnerabilities["@vitest/mocker"].via = ["missing-vulnerability"]; }, "FULL_AUDIT_UNRESOLVED_ADVISORY"],
    ["reject-severity-drift", (x) => { x.full.report.vulnerabilities["@vitest/mocker"].severity = "low"; }, "FULL_AUDIT_MAPPING_MISMATCH"],
    ["reject-node-drift", (x) => { x.full.report.vulnerabilities["@vitest/mocker"].nodes.push("node_modules/other-mocker"); }, "FULL_AUDIT_MAPPING_MISMATCH"],
    ["reject-security-expiry", (x) => { x.nowMs = EXPIRES_AT_MS; }, "SECURITY_EXCEPTION_EXPIRED"],
  ];
  for (const [name, mutate, code] of securityCases) runCase(name, auditFixture, mutate, decideSecurity, code);
  const diagnosticFixture = { schema: "optional-tree-content-manifest-v1", valid: true, manifest: [] };
  const acceptedEvidence = attachContentHashDiagnostic({ decision: { accepted: true, code: "OPTIONAL_TREE_EXCEPTION_ACCEPTED" } }, diagnosticFixture);
  tests.push({ name: "diagnostic-absent-on-accepted", expectedCode: "NO_DIAGNOSTIC", actualCode: Object.hasOwn(acceptedEvidence, "diagnostic") ? "DIAGNOSTIC_PRESENT" : "NO_DIAGNOSTIC",
    passed: !Object.hasOwn(acceptedEvidence, "diagnostic") });
  const otherFailure = attachContentHashDiagnostic({ decision: { accepted: false, code: "OPTIONAL_TREE_VERSION_MISMATCH" } }, diagnosticFixture);
  tests.push({ name: "diagnostic-absent-on-other-failure", expectedCode: "NO_DIAGNOSTIC", actualCode: Object.hasOwn(otherFailure, "diagnostic") ? "DIAGNOSTIC_PRESENT" : "NO_DIAGNOSTIC",
    passed: !Object.hasOwn(otherFailure, "diagnostic") });
  const mismatchEvidence = attachContentHashDiagnostic({ decision: { accepted: false, code: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH" } }, diagnosticFixture);
  tests.push({ name: "diagnostic-preserves-mismatch-failure", expectedCode: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH", actualCode: mismatchEvidence.decision.code,
    passed: evidenceExitCode(mismatchEvidence) === 1 && !mismatchEvidence.decision.accepted &&
      mismatchEvidence.decision.code === "OPTIONAL_TREE_CONTENT_HASH_MISMATCH" && mismatchEvidence.diagnostic === diagnosticFixture });
  const redacted = redactDiagnosticPath("/runner/temp/npm-cache", [{ placeholder: "<RUNNER_TEMP>", path: "/runner/temp" }]);
  tests.push({ name: "diagnostic-redacts-layout-path", expectedCode: "<RUNNER_TEMP>/npm-cache", actualCode: redacted,
    passed: redacted === "<RUNNER_TEMP>/npm-cache" && !redacted.includes("/runner/temp") });
  const outsidePath = redactDiagnosticPath("/opt/toolchain", [{ placeholder: "<HOME>", path: "/home/runner" }]);
  tests.push({ name: "diagnostic-redacts-unknown-absolute-path", expectedCode: "<ABSOLUTE_PATH>", actualCode: outsidePath,
    passed: outsidePath === "<ABSOLUTE_PATH>" });
  for (const [name, path] of [["diagnostic-rejects-absolute-path", "/etc/passwd"], ["diagnostic-rejects-parent-path", "lib/../secret"]]) {
    let code = null; try { validatePackageRelativePath(path); } catch (error) { code = error.code; }
    tests.push({ name, expectedCode: "DIAGNOSTIC_PATH_INVALID", actualCode: code, passed: code === "DIAGNOSTIC_PATH_INVALID" });
  }
  const escapingTarget = safeSymlinkTarget("/package", "lib/link", "../../outside");
  tests.push({ name: "diagnostic-redacts-escaping-symlink", expectedCode: UNSAFE_SYMLINK_TARGET, actualCode: escapingTarget.value,
    passed: !escapingTarget.safe && escapingTarget.value === UNSAFE_SYMLINK_TARGET });
  const internalTarget = safeSymlinkTarget("/package", "lib/link", "../index.js");
  tests.push({ name: "diagnostic-keeps-internal-symlink", expectedCode: "../index.js", actualCode: internalTarget.value,
    passed: internalTarget.safe && internalTarget.value === "../index.js" });
  let unknownConfigCode = null;
  try { validateDiagnosticConfigKeys([...DIAGNOSTIC_CONFIG_KEYS.slice(0, -1), "registry"]); }
  catch (error) { unknownConfigCode = error.code; }
  tests.push({ name: "diagnostic-rejects-unknown-config", expectedCode: "DIAGNOSTIC_NPM_CONFIG_KEY_NOT_ALLOWED", actualCode: unknownConfigCode,
    passed: unknownConfigCode === "DIAGNOSTIC_NPM_CONFIG_KEY_NOT_ALLOWED" });
  let sensitiveConfigCode = null;
  try { sanitizeDiagnosticConfigValue("platform", "https://user:token@example.invalid", []); }
  catch (error) { sensitiveConfigCode = error.code; }
  tests.push({ name: "diagnostic-rejects-sensitive-config-value", expectedCode: "DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE", actualCode: sensitiveConfigCode,
    passed: sensitiveConfigCode === "DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE" });
  const reversibleLayers = (value) => {
    const layers = [value]; let current = value;
    for (let depth = 0; depth < DIAGNOSTIC_MAX_DECODE_DEPTH + 2 && current.includes("%"); depth += 1) {
      try { current = decodeURIComponent(current); } catch { break; }
      layers.push(current);
    }
    return [...new Set(layers.filter((item) => Buffer.byteLength(item, "utf8") >= 8))];
  };
  const pushUnsafeDiagnosticCase = (name, operation, markers) => {
    let code = null;
    try { operation(); } catch (error) { code = error.code ?? "DIAGNOSTIC_NPM_CONFIG_READ_FAILED"; }
    const diagnostic = { schema: "optional-tree-content-manifest-v1", reason: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH",
      valid: false, npmConfig: null, errors: [{ package: "<environment>", code }] };
    const evidence = attachContentHashDiagnostic(
      { decision: { accepted: false, code: "OPTIONAL_TREE_CONTENT_HASH_MISMATCH" } }, diagnostic);
    const serialized = JSON.stringify(evidence);
    tests.push({ name, expectedCode: "DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE", actualCode: code,
      passed: code === "DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE" && evidenceExitCode(evidence) === 1 &&
        evidence.decision.code === "OPTIONAL_TREE_CONTENT_HASH_MISMATCH" && evidence.diagnostic.valid === false &&
        !Object.hasOwn(evidence.diagnostic, "manifest") && markers.every((marker) => !serialized.includes(marker)) });
  };
  const safeConfigValues = {
    cache: resolve(tmpdir(), "isme-policy-safe-cache"), prefix: resolve(tmpdir(), "isme-policy-safe-prefix"),
    "install-strategy": "hoisted", "legacy-peer-deps": "false", omit: "", include: "", "ignore-scripts": "false",
    "foreground-scripts": "false", "bin-links": "true", platform: "linux", arch: "x64", libc: "glibc",
  };
  const safeCommandRunner = (_command, commandArgs) => ({ exitCode: 0, error: null,
    stdout: `${safeConfigValues[commandArgs.at(-1)]}\n`, stderr: "" });
  for (const key of ["cache", "prefix"]) {
    const credentialUrl = `https://user:token@example.invalid/private-${key}`;
    let encoded = credentialUrl;
    for (let depth = 1; depth <= DIAGNOSTIC_MAX_DECODE_DEPTH + 1; depth += 1) {
      encoded = encodeURIComponent(encoded);
      const injectedEnv = {
        ...process.env,
        npm_config_cache: key === "cache" ? encoded : safeConfigValues.cache,
        npm_config_prefix: key === "prefix" ? encoded : safeConfigValues.prefix,
        npm_config_logs_dir: resolve(tmpdir(), "isme-policy-self-test-logs"),
        npm_config_update_notifier: "false",
      };
      const commandRunner = (command, commandArgs) => runCommand(command, commandArgs, { cwd: tmpdir(), env: injectedEnv });
      const markers = reversibleLayers(encoded);
      pushUnsafeDiagnosticCase(`diagnostic-rejects-normalized-${key}-depth-${depth}`,
        () => readSafeNpmConfig(DIAGNOSTIC_CONFIG_KEYS, commandRunner, {}), markers);
      if (depth === 2) for (const [rawName, rawKey] of [["lower", `npm_config_${key}`], ["upper", `NPM_CONFIG_${key.toUpperCase()}`]])
        pushUnsafeDiagnosticCase(`diagnostic-rejects-raw-${key}-${rawName}`,
          () => readSafeNpmConfig(DIAGNOSTIC_CONFIG_KEYS, safeCommandRunner, { [rawKey]: encoded }), markers);
    }
    const singleEncoded = encodeURIComponent(credentialUrl);
    const lowerCaseEncoding = singleEncoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
    const mixedCaseEncoding = singleEncoded.replace(/%[0-9A-F]{2}/g, (escape, offset) => offset % 2 ? escape.toLowerCase() : escape);
    for (const [variant, value] of [["lowercase", lowerCaseEncoding], ["mixedcase", mixedCaseEncoding]])
      pushUnsafeDiagnosticCase(`diagnostic-rejects-${key}-${variant}`, () => sanitizeDiagnosticConfigValue(key, value, []), reversibleLayers(value));
    for (const [shape, value] of [["unix", `/var/cache/${singleEncoded}`], ["windows", `C:\\cache\\${singleEncoded}`],
      ["encoded-slash", "cache%2fprivate"], ["encoded-backslash", "cache%5Cprivate"], ["invalid-percent", "cache/%2"],
      ["decode-error", "cache/%e0%a4"], ["c0-control", "cache/\u0001private"], ["c1-control", "cache/\u0085private"],
      ["token-signature", `cache/npm_${"a".repeat(24)}`]])
      pushUnsafeDiagnosticCase(`diagnostic-rejects-${key}-${shape}`, () => sanitizeDiagnosticConfigValue(key, value, []), reversibleLayers(value));
    const exactBoundary = "a".repeat(DIAGNOSTIC_VALUE_MAX_BYTES);
    let boundaryCode = "SAFE";
    try { assertNoSensitiveDiagnosticPath(exactBoundary); } catch (error) { boundaryCode = error.code; }
    tests.push({ name: `diagnostic-allows-${key}-4096-byte-boundary`, expectedCode: "SAFE", actualCode: boundaryCode,
      passed: boundaryCode === "SAFE" });
    const oversized = `${exactBoundary}a`;
    pushUnsafeDiagnosticCase(`diagnostic-rejects-${key}-oversized`, () => assertNoSensitiveDiagnosticPath(oversized), [oversized]);
  }
  const depthLimitValue = "%25252574oken-material";
  pushUnsafeDiagnosticCase("diagnostic-rejects-semantic-change-after-depth-limit",
    () => assertNoSensitiveDiagnosticPath(depthLimitValue), reversibleLayers(depthLimitValue));
  pushUnsafeDiagnosticCase("diagnostic-rejects-decoded-length-expansion",
    () => assertNoSensitiveDiagnosticPath("safe%20value", () => "x".repeat(64)), ["safe%20value"]);
  const placeholderCases = [
    ["workspace", "/workspace/cache", [{ placeholder: "<WORKSPACE>", path: "/workspace" }], "<WORKSPACE>/cache"],
    ["runner-temp", "/runner/temp/cache", [{ placeholder: "<RUNNER_TEMP>", path: "/runner/temp" }], "<RUNNER_TEMP>/cache"],
    ["home", "/home/runner/cache", [{ placeholder: "<HOME>", path: "/home/runner" }], "<HOME>/cache"],
    ["absolute", "/opt/cache", [{ placeholder: "<HOME>", path: "/home/runner" }], "<ABSOLUTE_PATH>"],
  ];
  for (const [name, value, roots, expected] of placeholderCases) {
    const actual = redactDiagnosticPath(value, roots);
    tests.push({ name: `diagnostic-keeps-${name}-placeholder-scope`, expectedCode: expected, actualCode: actual, passed: actual === expected });
  }
  const blockedDiagnostic = await buildContentHashDiagnostic(
    { node: "v22.23.2", npm: "10.9.9", platform: "linux", arch: "x64", libc: "glibc" },
    () => { throw diagnosticError("DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE"); });
  tests.push({ name: "diagnostic-unsafe-config-stops-before-manifest", expectedCode: "DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE",
    actualCode: blockedDiagnostic.errors?.[0]?.code,
    passed: blockedDiagnostic.valid === false && !Object.hasOwn(blockedDiagnostic, "manifest") &&
      !Object.hasOwn(blockedDiagnostic, "environment") && blockedDiagnostic.errors?.[0]?.code === "DIAGNOSTIC_NPM_CONFIG_VALUE_UNSAFE" });
  tests.push({ name: "diagnostic-normalizes-modes", expectedCode: NORMALIZED_MODE_RULE,
    actualCode: `${normalizedMode("regular", 0o100644)},${normalizedMode("regular", 0o100755)},${normalizedMode("symlink", 0o120777)}`,
    passed: fourDigitMode(0o100644) === "0644" && normalizedMode("regular", 0o100644) === "0644" &&
      normalizedMode("regular", 0o100755) === "0755" && normalizedMode("symlink", 0o120777) === "0777" });
  const runtimeReport = process.report.getReport();
  const liveDiagnostic = await buildContentHashDiagnostic({ node: process.version, npm: runCommand("npm", ["--version"]).stdout.trim(),
    platform: process.platform, arch: process.arch, libc: runtimeReport.header.glibcVersionRuntime ? "glibc" : "unknown" });
  const serializedDiagnostic = JSON.stringify(liveDiagnostic);
  const manifestFieldsValid = liveDiagnostic.manifest.every((item) => {
    const actual = Object.keys(item).sort();
    const expected = (item.type === "regular"
      ? ["normalizedMode", "package", "path", "rawMode", "sha256", "size", "type"]
      : ["normalizedMode", "package", "path", "rawMode", "size", "symlinkTarget", "type"]).sort();
    return JSON.stringify(actual) === JSON.stringify(expected);
  });
  const leakedRoots = [REPO_ROOT, process.env.RUNNER_TEMP, process.env.HOME].filter(Boolean)
    .filter((root) => serializedDiagnostic.includes(root));
  tests.push({ name: "diagnostic-live-manifest-safe", expectedCode: "LIVE_DIAGNOSTIC_SAFE", actualCode: liveDiagnostic.valid ? "LIVE_DIAGNOSTIC_SAFE" : "LIVE_DIAGNOSTIC_INVALID",
    passed: liveDiagnostic.valid && liveDiagnostic.manifest.length === Object.values(OPTIONAL_PACKAGES).reduce((sum, item) => sum + item.fileCount, 0) &&
      JSON.stringify([...new Set(liveDiagnostic.manifest.map((item) => item.package))].sort()) === JSON.stringify(Object.keys(OPTIONAL_PACKAGES).sort()) &&
      manifestFieldsValid && JSON.stringify(Object.keys(liveDiagnostic.npmConfig ?? {})) === JSON.stringify(DIAGNOSTIC_CONFIG_KEYS) &&
      /^0[0-7]{3}$/.test(liveDiagnostic.environment.umask) && leakedRoots.length === 0 });
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
  for (const [name, expected] of Object.entries(OPTIONAL_PACKAGES)) try { content[name] = await packageContentHash(name, resolve(REPO_ROOT, expected.path)); }
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
  const evidence = { policyVersion: POLICY_VERSION, generatedAt: new Date(nowMs).toISOString(), expiresAt: EXPIRES_AT, environment,
    optionalTree: { command: treeResult.command, rawExitCode: treeResult.exitCode, stderr: treeResult.stderr, jsonValid: treeResult.jsonValid,
      report: treeResult.parsed, rawStdout: treeResult.jsonValid ? undefined : treeResult.stdout, validation: optionalInput, decision: optionalDecision },
    security: { advisory: ALLOWED_ADVISORY,
      production: { command: productionResult.command, rawExitCode: productionResult.exitCode, stderr: productionResult.stderr, jsonValid: productionResult.jsonValid, summary: productionResult.jsonValid ? makeAuditSummary(productionResult.parsed) : null, report: productionResult.parsed },
      full: { command: fullResult.command, rawExitCode: fullResult.exitCode, stderr: fullResult.stderr, jsonValid: fullResult.jsonValid, summary: fullResult.jsonValid ? makeAuditSummary(fullResult.parsed) : null, report: fullResult.parsed },
      dependencyTree: { command: explainResult.command, rawExitCode: explainResult.exitCode, stderr: explainResult.stderr, jsonValid: explainResult.jsonValid, validation: explainResult.jsonValid ? inspectExceptionChain(explainResult.parsed) : null, report: explainResult.parsed }, decision: securityDecision },
    decision: optionalDecision.accepted && securityDecision.accepted ? { accepted: true, code: "OPTIONAL_TREE_EXCEPTION_ACCEPTED" }
      : !optionalDecision.accepted ? optionalDecision : securityDecision };
  if (evidence.decision.code !== "OPTIONAL_TREE_CONTENT_HASH_MISMATCH") return evidence;
  return attachContentHashDiagnostic(evidence, await buildContentHashDiagnostic(environment));
}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--self-test") process.exitCode = await runSelfTest();
else if (args.length) { process.stdout.write(`${JSON.stringify({ policyVersion: POLICY_VERSION, decision: { accepted: false, code: "USAGE_ERROR" }, usage: "node scripts/audit-security-policy.mjs [--self-test]" })}\n`); process.exitCode = 2; }
else { const evidence = await normalEvidence(); process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`); process.exitCode = evidenceExitCode(evidence); }
