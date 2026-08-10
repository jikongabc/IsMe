import type { Metadata } from "next";
import { ContactForm } from "@/app/(public)/contact/ContactForm";
import { Section } from "@/components/site/Section";
import { pickLocalized } from "@/lib/content/localize";
import { getPublicSiteBundle } from "@/lib/content/queries";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: translate(locale, "contact.title"),
    description: translate(locale, "contact.desc"),
    alternates: { canonical: "/contact" },
  };
}

export default async function ContactPage() {
  const [{ profile }, locale] = await Promise.all([
    getPublicSiteBundle(),
    getRequestLocale(),
  ]);

  return (
    <Section
      eyebrow={translate(locale, "contact.eyebrow")}
      title={translate(locale, "contact.title")}
      description={translate(locale, "contact.desc")}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <div className="portfolio-card">
          <ContactForm locale={locale} />
        </div>
        <aside className="portfolio-card text-sm text-ink-muted" aria-labelledby="contact-direct">
          <p className="section-kicker">{locale === "zh" ? "直接联系" : "Direct contact"}</p>
          <h2 id="contact-direct" className="mt-2 font-display text-xl text-ink">
            {translate(locale, "contact.aside")}
          </h2>
          {profile?.publicEmail ? (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Email
              </p>
              <a className="mt-2 inline-block break-all font-medium text-accent" href={`mailto:${profile.publicEmail}`}>
                {profile.publicEmail}
              </a>
            </div>
          ) : null}
          {profile?.availability || profile?.availabilityEn ? (
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {locale === "zh" ? "当前状态" : "Availability"}
              </p>
              <p className="mt-2 leading-relaxed text-ink-muted">
                {pickLocalized(locale, profile.availability, profile.availabilityEn)}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </Section>
  );
}
