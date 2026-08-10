import { NextResponse } from "next/server";

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function privateNoStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Pragma", PRIVATE_NO_STORE_HEADERS.Pragma);
  return response;
}

export function privateJson(
  value: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) {
    headers.set(key, value);
  }
  return NextResponse.json(value, { ...init, headers });
}

function headerOrigin(request: Request): string | null {
  // The bundled Nginx configs overwrite Host but do not establish
  // X-Forwarded-Host as a trusted boundary, so never consult the latter.
  const hostHeader = request.headers.get("host");
  const protoHeader = request.headers.get("x-forwarded-proto");
  const host = hostHeader?.trim();
  const proto = protoHeader?.trim().toLowerCase();

  // Forwarded protocol is overwritten by the bundled adjacent proxy. Reject
  // ambiguous lists instead of guessing when another deployment supplies it.
  if (!host || host.includes(",")) return null;
  if (protoHeader && (proto !== "http" && proto !== "https")) return null;

  try {
    const fallbackProtocol = new URL(request.url).protocol.replace(":", "");
    return new URL(`${proto ?? fallbackProtocol}://${host}`).origin;
  } catch {
    return null;
  }
}

/**
 * Route Handlers do not receive the Origin/Host check that Next applies to
 * Server Actions. All new cookie-authenticated mutations call this explicitly.
 */
export function requireSameOrigin(request: Request): NextResponse | null {
  const rawOrigin = request.headers.get("origin")?.trim();
  if (!rawOrigin || rawOrigin === "null" || rawOrigin.includes(",")) {
    return privateJson({ error: "Forbidden" }, { status: 403 });
  }

  let suppliedOrigin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.origin !== rawOrigin
    ) {
      return privateJson({ error: "Forbidden" }, { status: 403 });
    }
    suppliedOrigin = parsed.origin;
  } catch {
    return privateJson({ error: "Forbidden" }, { status: 403 });
  }

  const expected = headerOrigin(request) ?? new URL(request.url).origin;
  if (suppliedOrigin !== expected) {
    return privateJson({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
