import type { Metadata } from "next";
import { GuestbookForm } from "@/app/(public)/guestbook/GuestbookForm";
import { Section } from "@/components/site/Section";
import { listApprovedGuestbook } from "@/lib/guestbook/store";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: translate(locale, "guestbook.title"),
    description: translate(locale, "guestbook.desc"),
    alternates: { canonical: "/guestbook" },
  };
}

export default async function GuestbookPage() {
  const [locale, messages] = await Promise.all([
    getRequestLocale(),
    Promise.resolve(listApprovedGuestbook()),
  ]);

  return (
    <Section
      eyebrow={translate(locale, "guestbook.eyebrow")}
      title={translate(locale, "guestbook.title")}
      description={translate(locale, "guestbook.desc")}
    >
      <div className="space-y-10">
        <GuestbookForm locale={locale} />

        <section aria-labelledby="guestbook-wall">
          <h2 id="guestbook-wall" className="font-display text-2xl text-ink">
            {translate(locale, "guestbook.wall")}
          </h2>
          {messages.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">
              {translate(locale, "guestbook.empty")}
            </p>
          ) : (
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {messages.map((item) => (
                <li key={item.id} className="portfolio-card !p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-lg text-ink">{item.name}</span>
                    <time dateTime={item.createdAt} className="font-mono text-xs text-ink-faint">
                      {item.createdAt.slice(0, 10)}
                    </time>
                  </div>
                  <blockquote className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                    {item.body}
                  </blockquote>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Section>
  );
}
