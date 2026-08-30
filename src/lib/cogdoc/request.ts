import "server-only";

import { getEnv, isCogDocConfigured } from "@/lib/env";

export type CogDocRequestErrorCode =
  | "COGDOC_INVALID_PATH"
  | "COGDOC_NOT_CONFIGURED"
  | "COGDOC_REDIRECT_BLOCKED"
  | "COGDOC_TIMEOUT"
  | "COGDOC_UNAVAILABLE";

const REQUEST_ERROR_MESSAGES: Record<CogDocRequestErrorCode, string> = {
  COGDOC_INVALID_PATH: "Invalid CogDoc request path",
  COGDOC_NOT_CONFIGURED: "CogDoc is not configured",
  COGDOC_REDIRECT_BLOCKED: "CogDoc redirect was blocked",
  COGDOC_TIMEOUT: "CogDoc request timed out",
  COGDOC_UNAVAILABLE: "CogDoc service is unavailable",
};

export class CogDocRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: CogDocRequestErrorCode,
  ) {
    super(REQUEST_ERROR_MESSAGES[code]);
    this.name = "CogDocRequestError";
  }
}

type CogDocRequestInit = Omit<RequestInit, "redirect">;

function resolveCogDocUrl(path: string): URL {
  if (
    !path.startsWith("/")
    || path.startsWith("//")
    || path.includes("\\")
    || path.includes("#")
  ) {
    throw new CogDocRequestError(500, "COGDOC_INVALID_PATH");
  }
  if (!isCogDocConfigured()) {
    throw new CogDocRequestError(503, "COGDOC_NOT_CONFIGURED");
  }

  const origin = getEnv().COGDOC_API_URL;
  const url = new URL(path, origin);
  if (url.origin !== origin || `${url.pathname}${url.search}` !== path) {
    throw new CogDocRequestError(500, "COGDOC_INVALID_PATH");
  }
  return url;
}

function abortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function sanitizeCogDocText(value: string): string {
  let safe = value;
  const key = getEnv().COGDOC_API_KEY;
  if (key) safe = safe.split(key).join("[redacted]");
  safe = safe.replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [redacted]");
  safe = safe.replace(
    /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s"'<>]+/gi,
    "[redacted-url]",
  );
  return safe;
}

export function sanitizeCogDocData<T>(value: T): T {
  if (typeof value === "string") return sanitizeCogDocText(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCogDocData(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const sanitized = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeCogDocData(item)]),
    );
    return sanitized as T;
  }
  return value;
}

export async function cogdocRequest(
  path: string,
  init: CogDocRequestInit = {},
): Promise<Response> {
  const url = resolveCogDocUrl(path);
  const env = getEnv();
  const headers = new Headers(init.headers);
  if (env.COGDOC_API_KEY) {
    headers.set("Authorization", `Bearer ${env.COGDOC_API_KEY}`);
  } else {
    headers.delete("Authorization");
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), env.COGDOC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      throw new CogDocRequestError(502, "COGDOC_REDIRECT_BLOCKED");
    }
    return response;
  } catch (error) {
    if (error instanceof CogDocRequestError) throw error;
    if (controller.signal.aborted || abortError(error)) {
      throw new CogDocRequestError(504, "COGDOC_TIMEOUT");
    }
    throw new CogDocRequestError(502, "COGDOC_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
