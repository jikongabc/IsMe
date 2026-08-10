import { cookies } from "next/headers";
import { getSiteAppearance } from "@/lib/content/queries";
import { LOCALE_COOKIE, type Locale } from "./locales";

export async function getDefaultLocale(): Promise<Locale> {
  const { defaultLocale } = await getSiteAppearance();
  return defaultLocale;
}

export async function getRequestLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (fromCookie === "zh" || fromCookie === "en") return fromCookie;
  return getDefaultLocale();
}
