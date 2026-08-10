import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import type {
  ReadinessLinkCheck,
  ReadinessLinkTarget,
} from "@/lib/readiness/types";

export type { ReadinessLinkTarget } from "@/lib/readiness/types";

type LookupAddress = {
  address: string;
  family: 4 | 6;
};

type LinkAuditDeadline = {
  controller: AbortController;
  expiresAt: number;
};

export type LinkAuditTransportRequest = {
  url: URL;
  address: string;
  family: 4 | 6;
  method: "HEAD" | "GET";
  timeoutMs: number;
  signal: AbortSignal;
};

export type LinkAuditTransportResponse = {
  statusCode: number;
  location?: string;
};

export type LinkAuditOptions = {
  /** Dependency seam for deterministic tests. Production callers should omit it. */
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  /** Dependency seam for deterministic tests. Production callers should omit it. */
  transport?: (
    request: LinkAuditTransportRequest,
  ) => Promise<LinkAuditTransportResponse>;
  concurrency?: number;
  maxRedirects?: number;
  timeoutMs?: number;
};

export const MAX_LINK_AUDIT_TARGETS = 40;

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_CONCURRENCY = 4;
const MAX_URL_LENGTH = 2_048;

const IPV4_BLOCKED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [ipv4ToNumber("0.0.0.0"), 8],
  [ipv4ToNumber("10.0.0.0"), 8],
  [ipv4ToNumber("100.64.0.0"), 10],
  [ipv4ToNumber("127.0.0.0"), 8],
  [ipv4ToNumber("169.254.0.0"), 16],
  [ipv4ToNumber("172.16.0.0"), 12],
  [ipv4ToNumber("192.0.0.0"), 24],
  [ipv4ToNumber("192.0.2.0"), 24],
  [ipv4ToNumber("192.88.99.0"), 24],
  [ipv4ToNumber("192.168.0.0"), 16],
  [ipv4ToNumber("198.18.0.0"), 15],
  [ipv4ToNumber("198.51.100.0"), 24],
  [ipv4ToNumber("203.0.113.0"), 24],
  [ipv4ToNumber("224.0.0.0"), 4],
  [ipv4ToNumber("240.0.0.0"), 4],
];

const IPV6_GLOBAL_UNICAST = [ipv6ToBigInt("2000::"), 3] as const;
const IPV6_BLOCKED_GLOBAL_RANGES: ReadonlyArray<readonly [bigint, number]> = [
  // IETF protocol assignments, including Teredo, benchmarking and ORCHID.
  [ipv6ToBigInt("2001::"), 23],
  // Documentation prefixes.
  [ipv6ToBigInt("2001:db8::"), 32],
  [ipv6ToBigInt("3fff::"), 20],
  // 6to4 can otherwise smuggle an embedded IPv4 destination.
  [ipv6ToBigInt("2002::"), 16],
  // Former 6bone space is reserved.
  [ipv6ToBigInt("3ffe::"), 16],
];

class LinkAuditError extends Error {
  constructor(
    readonly kind:
      | "blocked"
      | "insecure"
      | "dns"
      | "network"
      | "redirect"
      | "timeout",
  ) {
    super(kind);
    this.name = "LinkAuditError";
  }
}

function ipv4ToNumber(address: string): number {
  const parts = address.split(".");
  if (parts.length !== 4) return -1;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return -1;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return -1;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function ipv6ToBigInt(address: string): bigint {
  const withoutZone = address.toLowerCase().split("%", 1)[0] ?? "";
  let normalized = withoutZone;

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    if (lastColon < 0) return BigInt(-1);
    const ipv4 = ipv4ToNumber(normalized.slice(lastColon + 1));
    if (ipv4 < 0) return BigInt(-1);
    normalized = `${normalized.slice(0, lastColon)}:${(
      (ipv4 >>> 16) & 0xffff
    ).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const compression = normalized.indexOf("::");
  if (compression !== normalized.lastIndexOf("::")) return BigInt(-1);

  const left = (compression >= 0 ? normalized.slice(0, compression) : normalized)
    .split(":")
    .filter(Boolean);
  const right = (compression >= 0 ? normalized.slice(compression + 2) : "")
    .split(":")
    .filter(Boolean);
  const missing = 8 - left.length - right.length;

  if ((compression < 0 && missing !== 0) || (compression >= 0 && missing < 1)) {
    return BigInt(-1);
  }

  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return BigInt(-1);
  }

  return groups.reduce(
    (value, part) => (value << BigInt(16)) | BigInt(`0x${part}`),
    BigInt(0),
  );
}

function isIpv4InRange(address: number, network: number, prefix: number): boolean {
  const shift = 32 - prefix;
  return (address >>> shift) === (network >>> shift);
}

function isIpv6InRange(address: bigint, network: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return address >> shift === network >> shift;
}

/**
 * Return true only for globally routable unicast addresses. Invalid, private,
 * loopback, link-local, multicast, documentation and reserved addresses fail
 * closed. IPv4-mapped IPv6 addresses are classified by their embedded IPv4.
 */
export function isPublicIpAddress(address: string): boolean {
  const normalized = address.trim().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);

  if (family === 4) {
    const value = ipv4ToNumber(normalized);
    if (value < 0) return false;
    return !IPV4_BLOCKED_RANGES.some(([network, prefix]) =>
      isIpv4InRange(value, network, prefix),
    );
  }

  if (family !== 6) return false;
  const value = ipv6ToBigInt(normalized);
  if (value < BigInt(0)) return false;

  const mappedPrefix = ipv6ToBigInt("::ffff:0:0");
  if (isIpv6InRange(value, mappedPrefix, 96)) {
    const embeddedIpv4 = Number(value & BigInt("0xffffffff"));
    return !IPV4_BLOCKED_RANGES.some(([network, prefix]) =>
      isIpv4InRange(embeddedIpv4, network, prefix),
    );
  }

  if (!isIpv6InRange(value, IPV6_GLOBAL_UNICAST[0], IPV6_GLOBAL_UNICAST[1])) {
    return false;
  }

  return !IPV6_BLOCKED_GLOBAL_RANGES.some(([network, prefix]) =>
    isIpv6InRange(value, network, prefix),
  );
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value!)));
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return sanitized.slice(0, maxLength) || fallback;
}

/** Strip credentials, queries and fragments before a URL enters a report DTO. */
export function sanitizeAuditedUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") return "(invalid URL)";
  try {
    const url = new URL(rawUrl.trim());
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "(invalid URL)";
  }
}

function detailForError(error: unknown): string {
  if (!(error instanceof LinkAuditError)) return "Could not connect to this link.";
  switch (error.kind) {
    case "blocked":
      return "Destination is outside the public web safety boundary.";
    case "insecure":
      return "Public portfolio links must use HTTPS without a downgrade redirect.";
    case "dns":
      return "The hostname could not be resolved.";
    case "redirect":
      return "The link exceeded the redirect safety limit.";
    case "timeout":
      return "The link did not respond within five seconds.";
    case "network":
    default:
      return "Could not connect to this link.";
  }
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.flatMap(({ address, family }) =>
    family === 4 || family === 6 ? [{ address, family }] : [],
  );
}

/**
 * Build a DNS-pinned request: the socket connects to the validated address,
 * while HTTP Host, TLS SNI, and certificate identity remain bound to the
 * original public hostname.
 */
export function buildPinnedRequestOptions(
  input: LinkAuditTransportRequest,
): RequestOptions {
  const hostname = stripIpv6Brackets(input.url.hostname);
  const isHttps = input.url.protocol === "https:";
  return {
    protocol: input.url.protocol,
    hostname: input.address,
    family: input.family,
    port: isHttps ? 443 : 80,
    method: input.method,
    path: `${input.url.pathname}${input.url.search}`,
    agent: false,
    signal: input.signal,
    headers: {
      Accept: "*/*",
      Connection: "close",
      Host: input.url.host,
      "User-Agent": "IsMe-Readiness-Audit/1.0",
    },
    ...(isHttps
      ? {
          servername: isIP(hostname) === 0 ? hostname : undefined,
          checkServerIdentity: (_host: string, certificate: Parameters<
            typeof checkServerIdentity
          >[1]) => checkServerIdentity(hostname, certificate),
        }
      : {}),
  };
}

async function defaultTransport(
  input: LinkAuditTransportRequest,
): Promise<LinkAuditTransportResponse> {
  const isHttps = input.url.protocol === "https:";
  const options = buildPinnedRequestOptions(input);

  return new Promise((resolve, reject) => {
    const request = (isHttps ? httpsRequest : httpRequest)(options, (response) => {
      const statusCode = response.statusCode;
      const location = response.headers.location;
      response.destroy();

      if (typeof statusCode !== "number") {
        reject(new LinkAuditError("network"));
        return;
      }
      resolve({ statusCode, location });
    });

    request.once("error", () => reject(new LinkAuditError("network")));
    request.end();
  });
}

function remainingDeadlineMs(deadline: LinkAuditDeadline): number {
  return Math.max(0, deadline.expiresAt - Date.now());
}

function assertDeadline(deadline: LinkAuditDeadline): void {
  if (deadline.controller.signal.aborted || remainingDeadlineMs(deadline) <= 0) {
    deadline.controller.abort();
    throw new LinkAuditError("timeout");
  }
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  deadline: LinkAuditDeadline,
): Promise<T> {
  assertDeadline(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      deadline.controller.abort();
      reject(new LinkAuditError("timeout"));
    }, remainingDeadlineMs(deadline));
  });

  try {
    return await Promise.race([operation(deadline.controller.signal), timeout]);
  } catch (error) {
    if (deadline.controller.signal.aborted) {
      throw new LinkAuditError("timeout");
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseSafeUrl(rawUrl: unknown): URL {
  if (typeof rawUrl !== "string" || rawUrl.length > MAX_URL_LENGTH) {
    throw new TypeError("invalid-url");
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new TypeError("invalid-url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LinkAuditError("blocked");
  }
  if (!url.hostname || url.username || url.password || url.port) {
    throw new LinkAuditError("blocked");
  }

  url.hash = "";
  return url;
}

async function resolvePublicAddress(
  url: URL,
  lookup: NonNullable<LinkAuditOptions["lookup"]>,
  deadline: LinkAuditDeadline,
): Promise<LookupAddress> {
  assertDeadline(deadline);
  const hostname = stripIpv6Brackets(url.hostname);
  const literalFamily = isIP(hostname);

  let addresses: LookupAddress[];
  if (literalFamily === 4 || literalFamily === 6) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await withDeadline(() => lookup(hostname), deadline);
    } catch (error) {
      if (error instanceof LinkAuditError) throw error;
      throw new LinkAuditError("dns");
    }
  }

  assertDeadline(deadline);

  if (
    addresses.length === 0 ||
    addresses.some(
      (entry) =>
        (entry.family !== 4 && entry.family !== 6) ||
        !isPublicIpAddress(entry.address),
    )
  ) {
    throw new LinkAuditError("blocked");
  }

  return addresses[0]!;
}

function isRedirect(statusCode: number): boolean {
  return [300, 301, 302, 303, 307, 308].includes(statusCode);
}

async function probeUrl(
  url: URL,
  method: "HEAD" | "GET",
  redirectsUsed: number,
  options: Required<
    Pick<LinkAuditOptions, "lookup" | "transport" | "maxRedirects" | "timeoutMs">
  >,
  deadline: LinkAuditDeadline,
): Promise<{ statusCode: number; finalUrl: URL }> {
  assertDeadline(deadline);
  const resolved = await resolvePublicAddress(url, options.lookup, deadline);

  let response: LinkAuditTransportResponse;
  try {
    response = await withDeadline(
      (signal) =>
        options.transport({
          url,
          address: resolved.address,
          family: resolved.family,
          method,
          timeoutMs: remainingDeadlineMs(deadline),
          signal,
        }),
      deadline,
    );
  } catch (error) {
    if (error instanceof LinkAuditError) throw error;
    throw new LinkAuditError("network");
  }

  assertDeadline(deadline);

  if (isRedirect(response.statusCode) && response.location) {
    if (redirectsUsed >= options.maxRedirects) {
      throw new LinkAuditError("redirect");
    }

    let redirectedUrl: URL;
    try {
      redirectedUrl = parseSafeUrl(new URL(response.location, url).toString());
    } catch (error) {
      if (error instanceof LinkAuditError) throw error;
      throw new LinkAuditError("redirect");
    }
    if (url.protocol === "https:" && redirectedUrl.protocol !== "https:") {
      throw new LinkAuditError("insecure");
    }
    return probeUrl(redirectedUrl, method, redirectsUsed + 1, options, deadline);
  }

  // Some CDNs and WAFs reject HEAD even though the same page is public. Retry
  // any terminal non-2xx with GET under the same absolute deadline; the
  // transport destroys the response immediately, so no response body is read.
  if (
    method === "HEAD" &&
    (response.statusCode < 200 || response.statusCode >= 300)
  ) {
    return probeUrl(url, "GET", redirectsUsed, options, deadline);
  }

  return { statusCode: response.statusCode, finalUrl: url };
}

async function auditTarget(
  target: ReadinessLinkTarget,
  options: Required<
    Pick<LinkAuditOptions, "lookup" | "transport" | "maxRedirects" | "timeoutMs">
  >,
): Promise<ReadinessLinkCheck> {
  const startedAt = Date.now();
  const url = sanitizeAuditedUrl(target.url);
  const base = {
    url,
    label: sanitizeText(target.label, "External link", 160),
    source: sanitizeText(target.source, "unknown", 80),
  };

  let parsedUrl: URL;
  try {
    parsedUrl = parseSafeUrl(target.url);
  } catch (error) {
    if (error instanceof LinkAuditError) {
      return {
        ...base,
        status: "blocked",
        latencyMs: Date.now() - startedAt,
        detail: detailForError(error),
      };
    }
    return {
      ...base,
      status: "skipped",
      latencyMs: Date.now() - startedAt,
      detail: "The link is not a valid web URL.",
    };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      ...base,
      status: "blocked",
      latencyMs: Date.now() - startedAt,
      detail: detailForError(new LinkAuditError("insecure")),
    };
  }

  const deadline: LinkAuditDeadline = {
    controller: new AbortController(),
    expiresAt: Date.now() + options.timeoutMs,
  };

  try {
    const result = await withDeadline(
      () => probeUrl(parsedUrl, "HEAD", 0, options, deadline),
      deadline,
    );
    // Redirects with Location have already been followed above. A final 3xx,
    // auth challenge, rate limit, or 4xx does not prove an interviewer can see
    // the linked content, so only a successful 2xx clears the release gate.
    const ok = result.statusCode >= 200 && result.statusCode < 300;
    return {
      ...base,
      status: ok ? "ok" : "failed",
      httpStatus: result.statusCode,
      latencyMs: Date.now() - startedAt,
      detail: ok
        ? "The destination responded and appears reachable."
        : `The destination returned HTTP ${result.statusCode}.`,
    };
  } catch (error) {
    return {
      ...base,
      status:
        error instanceof LinkAuditError &&
        (error.kind === "blocked" || error.kind === "insecure")
          ? "blocked"
          : "failed",
      latencyMs: Date.now() - startedAt,
      detail: detailForError(error),
    };
  } finally {
    deadline.controller.abort();
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

/**
 * Audit a bounded list of administrator-owned portfolio links. The function is
 * intentionally not suitable for a public URL-checking endpoint: callers must
 * enforce administrator authentication before invoking it.
 */
export async function auditReadinessLinks(
  targets: ReadinessLinkTarget[],
  options: LinkAuditOptions = {},
): Promise<ReadinessLinkCheck[]> {
  const boundedTargets = targets.slice(0, MAX_LINK_AUDIT_TARGETS);
  if (boundedTargets.length === 0) return [];

  const normalizedOptions = {
    lookup: options.lookup ?? defaultLookup,
    transport: options.transport ?? defaultTransport,
    concurrency: clampInteger(options.concurrency, DEFAULT_CONCURRENCY, 1, 4),
    maxRedirects: clampInteger(
      options.maxRedirects,
      DEFAULT_MAX_REDIRECTS,
      0,
      DEFAULT_MAX_REDIRECTS,
    ),
    timeoutMs: clampInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 100, DEFAULT_TIMEOUT_MS),
  };

  return mapWithConcurrency(
    boundedTargets,
    normalizedOptions.concurrency,
    (target) => auditTarget(target, normalizedOptions),
  );
}
