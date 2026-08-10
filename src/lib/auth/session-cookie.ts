/** Shared cookie / payload helpers used by the Node session and Next.js Proxy. */

export const ADMIN_SESSION_COOKIE = "isme_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AdminSessionPayload = {
  role: "admin";
  exp: number;
};

/** Decode base64url to bytes (Edge + Node). */
export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function utf8FromBase64Url(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

export function parseSessionBody(body: string): AdminSessionPayload | null {
  try {
    const payload = JSON.parse(utf8FromBase64Url(body)) as AdminSessionPayload;
    if (payload.role !== "admin" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Edge-safe HMAC-SHA256 (base64url) for Proxy verification. */
export async function hmacSha256Base64Url(
  value: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(sig);
}

export async function verifyAdminSessionToken(
  token: string,
  secret: string,
): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  try {
    const expected = await hmacSha256Base64Url(body, secret);
    const a = base64UrlToBytes(signature);
    const b = base64UrlToBytes(expected);
    if (!timingSafeEqualBytes(a, b)) return false;
    return parseSessionBody(body) !== null;
  } catch {
    return false;
  }
}
