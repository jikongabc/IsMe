/** Allow only same-origin admin relative paths after login. */
export function safeAdminNextPath(raw: string | null | undefined): string {
  if (!raw) return "/admin";
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/admin";
  }
  if (!value.startsWith("/admin")) return "/admin";
  if (value.includes("://")) return "/admin";
  return value;
}
