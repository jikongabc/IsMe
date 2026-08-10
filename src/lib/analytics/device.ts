export type DeviceClass = "mobile" | "tablet" | "desktop" | "bot" | "unknown";

/** Lightweight UA classification — no third-party geo/UA DB. */
export function classifyDevice(userAgent: string): DeviceClass {
  const ua = userAgent.toLowerCase();
  if (!ua.trim()) return "unknown";
  if (
    /bot|crawl|spider|slurp|facebookexternalhit|preview|wget|curl|python-requests|headless/.test(
      ua,
    )
  ) {
    return "bot";
  }
  if (/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/.test(ua)) {
    return "tablet";
  }
  if (/mobi|iphone|ipod|android.*mobile|windows phone|opera mini/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

/**
 * Country from common CDN / reverse-proxy headers.
 * Empty when the edge does not inject geo (typical on bare localhost).
 */
export function detectCountry(headers: Headers): string {
  const raw =
    headers.get("cf-ipcountry") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("cloudfront-viewer-country") ||
    headers.get("x-country-code") ||
    headers.get("x-appengine-country") ||
    "";
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return "";
  return code;
}
