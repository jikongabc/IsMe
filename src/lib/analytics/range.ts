export type InsightsRange = "7d" | "30d" | "90d" | "all";

export function parseInsightsRange(raw: string | null | undefined): InsightsRange {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "all") return raw;
  return "30d";
}

/** ISO timestamp lower bound, or null for all-time. */
export function rangeSinceIso(range: InsightsRange, now = new Date()): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return since.toISOString();
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Fill missing calendar days between since..until with 0 counts. */
export function fillDailySeries(
  rows: Array<{ day: string; count: number }>,
  sinceIso: string | null,
  until = new Date(),
): Array<{ day: string; count: number }> {
  const map = new Map(rows.map((r) => [r.day, r.count]));
  const end = new Date(until);
  end.setUTCHours(0, 0, 0, 0);
  const start = sinceIso
    ? new Date(sinceIso.slice(0, 10) + "T00:00:00.000Z")
    : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);

  const out: Array<{ day: string; count: number }> = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, count: map.get(day) ?? 0 });
  }
  return out;
}
