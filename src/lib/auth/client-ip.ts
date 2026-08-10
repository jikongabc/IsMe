/**
 * Resolve the connecting client IP behind a trusted reverse proxy.
 *
 * Prefer X-Real-IP (set to $remote_addr by our nginx). Fall back to the
 * rightmost X-Forwarded-For hop (the address appended by the adjacent proxy),
 * never the leftmost client-supplied value.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }

  return "unknown";
}

export function clientIpFromRequest(request: Request): string {
  return clientIpFromHeaders(request.headers);
}
