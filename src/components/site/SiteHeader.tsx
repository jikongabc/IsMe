import Link from "next/link";
import { LocaleSwitcher } from "@/components/site/LocaleSwitcher";
import { ThemeSwitcher } from "@/components/site/ThemeSwitcher";
import { translate, type Locale } from "@/lib/i18n";
import type { SiteTheme } from "@/lib/theme";

type Props = {
  siteName: string;
  locale: Locale;
  theme: SiteTheme;
  enabledThemes: SiteTheme[];
};

export function SiteHeader({ siteName, locale, theme, enabledThemes }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const links = [
    { href: "/projects", label: t("nav.projects") },
    { href: "/#experience", label: t("nav.xp") },
    { href: "/blog", label: t("nav.blog") },
    { href: "/resume", label: t("nav.resume") },
    { href: "/contact", label: t("nav.contact") },
  ];

  return (
    <header className="site-header sticky top-0 z-40 border-b border-line bg-bg/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-3 text-ink">
          <span className="brand-mark" aria-hidden="true">
            IS
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-semibold tracking-tight group-hover:text-accent">
            {siteName || "isme"}
            </span>
            <span className="hidden text-[0.65rem] uppercase tracking-[0.16em] text-ink-faint sm:block">
              {t("nav.whoami")}
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-5 lg:flex">
          <nav className="flex items-center gap-1 text-sm" aria-label="Primary navigation">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 border-l border-line pl-4">
            <ThemeSwitcher
              theme={theme}
              enabledThemes={enabledThemes}
              label={t("theme.label")}
            />
            <LocaleSwitcher locale={locale} />
          </div>
          <Link href="/knowledge" className="btn-primary !px-4 !py-2 text-sm">
            {t("nav.ask")}
          </Link>
        </div>

        <details className="mobile-menu relative lg:hidden">
          <summary className="menu-trigger" aria-label="Open navigation">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </summary>
          <div className="mobile-menu-panel">
            <nav className="grid" aria-label="Mobile navigation">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="mobile-nav-link">
                  {link.label}
                </Link>
              ))}
              <Link href="/guestbook" className="mobile-nav-link">
                {t("nav.guestbook")}
              </Link>
            </nav>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <ThemeSwitcher
                theme={theme}
                enabledThemes={enabledThemes}
                label={t("theme.label")}
              />
              <LocaleSwitcher locale={locale} />
            </div>
            <Link href="/knowledge" className="btn-primary mt-4 w-full">
              {t("nav.ask")}
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
