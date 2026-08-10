import type { SocialLink } from "@/lib/db/schema";
import { translate, type Locale } from "@/lib/i18n";

type Props = {
  siteName: string;
  socialLinks: SocialLink[];
  locale: Locale;
};

export function SiteFooter({ siteName, socialLinks, locale }: Props) {
  return (
    <footer className="site-footer mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-xs text-ink-muted">
          <span className="font-display font-semibold text-ink">{siteName || "IsMe"}</span>
          {" · "}
          {translate(locale, "footer.built")}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <a href="/guestbook" className="text-ink-muted transition hover:text-accent-2">
            {translate(locale, "nav.guestbook")}
          </a>
          <a href="/feed.xml" className="text-ink-muted transition hover:text-accent-2">
            {translate(locale, "footer.rss")}
          </a>
          <a href="/atom.xml" className="text-ink-muted transition hover:text-accent-2">
            {translate(locale, "footer.atom")}
          </a>
          {socialLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              className="text-ink-muted transition hover:text-accent-2"
              target={link.url.startsWith("http") ? "_blank" : undefined}
              rel={link.url.startsWith("http") ? "noreferrer" : undefined}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
