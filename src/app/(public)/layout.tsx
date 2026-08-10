import { PageViewBeacon } from "@/components/site/PageViewBeacon";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getPublicSiteBundle, getSiteAppearance } from "@/lib/content/queries";
import { getRequestLocale } from "@/lib/i18n/get-locale";
import { getRequestTheme } from "@/lib/theme/get-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [{ profile, socialLinks }, locale, theme, appearance] = await Promise.all([
    getPublicSiteBundle(),
    getRequestLocale(),
    getRequestTheme(),
    getSiteAppearance(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <PageViewBeacon locale={locale} />
      <SiteHeader
        siteName={profile?.siteName || profile?.displayName || "IsMe"}
        locale={locale}
        theme={theme}
        enabledThemes={appearance.themeConfig.enabledThemes}
      />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter
        siteName={profile?.siteName || profile?.displayName || "IsMe"}
        socialLinks={socialLinks}
        locale={locale}
      />
    </div>
  );
}
