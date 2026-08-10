/** A post is publicly live when status=published and publish time has arrived. */
export function isPostLive(
  post: { status: string; publishedAt: string | null },
  now = new Date(),
): boolean {
  if (post.status !== "published") return false;
  if (!post.publishedAt) return true;
  const at = Date.parse(post.publishedAt);
  if (Number.isNaN(at)) return true;
  return at <= now.getTime();
}

export function postVisibilityLabel(
  post: { status: string; publishedAt: string | null },
  now = new Date(),
): string {
  if (post.status === "draft") return "draft";
  if (post.status === "archived") return "archived";
  if (post.status === "published" && post.publishedAt) {
    const at = Date.parse(post.publishedAt);
    if (!Number.isNaN(at) && at > now.getTime()) return "scheduled";
  }
  if (post.status === "published") return "published";
  return post.status;
}

/** Normalize datetime-local / ISO input to ISO string, or null. */
export function normalizePublishAt(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** datetime-local value from ISO for admin inputs. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
