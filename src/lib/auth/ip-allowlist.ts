import { clientIpFromHeaders } from "@/lib/auth/client-ip";

export { clientIpFromHeaders } from "@/lib/auth/client-ip";

/** Parse ADMIN_IP_ALLOWLIST (comma-separated). Empty = allow all. */
export function parseIpAllowlist(raw: string | undefined | null): string[] | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const list = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

export function isIpAllowed(ip: string, allowlist: string[] | null): boolean {
  if (!allowlist) return true;
  if (allowlist.includes("*")) return true;
  const normalized = ip.trim() || "unknown";
  return allowlist.includes(normalized);
}

export function isAdminIpAllowedForRequest(headers: Headers): boolean {
  const allowlist = parseIpAllowlist(process.env.ADMIN_IP_ALLOWLIST);
  return isIpAllowed(clientIpFromHeaders(headers), allowlist);
}
