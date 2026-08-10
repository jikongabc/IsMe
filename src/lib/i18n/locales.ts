export const LOCALES = ["zh", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "isme_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: "中文",
  en: "EN",
};

export function normalizeLocale(value: unknown): Locale {
  if (value === "en" || value === "zh") return value;
  return "zh";
}
