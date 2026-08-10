import type { Locale } from "@/lib/i18n";

/** Prefer locale-specific text; fall back to primary (usually zh/default). */
export function pickLocalized(
  locale: Locale,
  primary: string,
  english?: string | null,
): string {
  if (locale === "en") {
    const en = (english ?? "").trim();
    if (en) return en;
  }
  return primary ?? "";
}
