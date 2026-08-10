import { cookies } from "next/headers";
import { getSiteAppearance } from "@/lib/content/queries";
import {
  isSiteTheme,
  THEME_COOKIE,
  type SiteTheme,
  type ThemeConfig,
} from "@/lib/theme";

export async function getDefaultTheme(): Promise<SiteTheme> {
  const { theme } = await getSiteAppearance();
  return theme;
}

export async function getThemeConfig(): Promise<ThemeConfig> {
  const { themeConfig } = await getSiteAppearance();
  return themeConfig;
}

/** Visitor cookie override (if enabled), else site default from admin. */
export async function getRequestTheme(): Promise<SiteTheme> {
  const { theme: defaultTheme, themeConfig } = await getSiteAppearance();
  const jar = await cookies();
  const fromCookie = jar.get(THEME_COOKIE)?.value;
  if (isSiteTheme(fromCookie) && themeConfig.enabledThemes.includes(fromCookie)) {
    return fromCookie;
  }
  return defaultTheme;
}
