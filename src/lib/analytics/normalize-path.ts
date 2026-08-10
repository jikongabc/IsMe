/** Accept only public, same-origin style paths for pageview tracking. */
export function normalizePublicPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;

  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (!pathOnly || pathOnly.length > 300) return null;
  if (pathOnly.startsWith("/admin") || pathOnly.startsWith("/api")) return null;
  if (pathOnly.includes("..")) return null;

  return pathOnly.replace(/\/{2,}/g, "/") || "/";
}

export function normalizeReferrer(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.slice(0, 300);
  } catch {
    return value.slice(0, 120);
  }
}
