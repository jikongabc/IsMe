import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { PrintButton } from "@/components/resume/PrintButton";
import { pickLocalized } from "@/lib/content/localize";
import { getPublicSiteBundle } from "@/lib/content/queries";
import { getEnv } from "@/lib/env";
import { translate, type MessageKey } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";
import { personJsonLd } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const [{ profile }, locale] = await Promise.all([
    getPublicSiteBundle(),
    getRequestLocale(),
  ]);
  const name = profile?.displayName || profile?.siteName || "IsMe";
  const description = pickLocalized(
    locale,
    profile?.headline || `Resume for ${name}`,
    profile?.headlineEn,
  );
  return {
    title: `${name} — Resume`,
    description,
    alternates: { canonical: "/resume" },
    openGraph: {
      title: `${name} · Resume`,
      description,
      url: `${getEnv().SITE_URL}/resume`,
    },
  };
}

const typeOrder = ["work", "education", "competition", "project", "other"] as const;

const typeKeys: Record<string, MessageKey> = {
  work: "type.work",
  education: "type.education",
  project: "type.project",
  competition: "type.competition",
  other: "type.other",
};

export default async function ResumePage() {
  const [{ profile, socialLinks, focusAreas, experiences, projects }, locale] =
    await Promise.all([getPublicSiteBundle(), getRequestLocale()]);

  const name = profile?.displayName || profile?.siteName || "IsMe";
  const siteUrl = getEnv().SITE_URL.replace(/\/$/, "");
  const t = (key: MessageKey) => translate(locale, key);

  const role = pickLocalized(locale, profile?.role || "", profile?.roleEn);
  const headline = pickLocalized(locale, profile?.headline || "", profile?.headlineEn);
  const introduction = pickLocalized(
    locale,
    profile?.introduction || "",
    profile?.introductionEn,
  );
  const availability = pickLocalized(
    locale,
    profile?.availability || "",
    profile?.availabilityEn,
  );
  const copy =
    locale === "zh"
      ? {
          summary: "个人简介",
          present: "至今",
          source: "在线版本",
          ask: "项目问答",
          generated: "由 IsMe 生成",
          code: "代码",
          live: "演示",
          caseStudy: "案例",
        }
      : {
          summary: "Summary",
          present: "Present",
          source: "Online version",
          ask: "Project Q&A",
          generated: "Generated with IsMe",
          code: "Code",
          live: "Live",
          caseStudy: "Case study",
        };

  const grouped = typeOrder
    .map((type) => ({
      type,
      items: experiences.filter((item) => item.type === type),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <JsonLd
        data={personJsonLd({
          name,
          jobTitle: role || undefined,
          description: headline || introduction || undefined,
          email: profile?.publicEmail || undefined,
          location: profile?.location || undefined,
          image: profile?.avatarUrl || undefined,
          sameAs: socialLinks.map((link) => link.url),
        })}
      />

      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <p className="text-xs text-accent-2">{t("resume.eyebrow")}</p>
            <p className="font-display text-3xl text-ink">{t("resume.title")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrintButton label={t("resume.print")} />
            <Link href="/" className="btn-ghost">
              {t("resume.back")}
            </Link>
          </div>
        </div>

        <article className="resume-sheet portfolio-card print:border-0 print:bg-white print:p-0 print:shadow-none print:text-black">
          <header className="border-b border-line pb-5 print:border-black/20">
            <h1 className="font-display text-3xl tracking-tight text-ink print:text-black">
              {name}
            </h1>
            {role ? (
              <p className="mt-1 text-accent print:text-black/70">{role}</p>
            ) : null}
            {headline ? (
              <p className="mt-3 text-sm text-ink-muted print:text-black/80">{headline}</p>
            ) : null}
            <address className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs not-italic text-ink-faint print:text-black/60">
              {profile?.location ? <span>{profile.location}</span> : null}
              {profile?.publicEmail ? (
                <a href={`mailto:${profile.publicEmail}`} className="hover:text-accent print:text-black">
                  {profile.publicEmail}
                </a>
              ) : null}
              {availability ? <span>{availability}</span> : null}
              {socialLinks.slice(0, 4).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  className="hover:text-accent print:text-black"
                  target={link.url.startsWith("http") ? "_blank" : undefined}
                  rel={link.url.startsWith("http") ? "noreferrer" : undefined}
                >
                  {link.label}
                </a>
              ))}
            </address>
          </header>

          {introduction ? (
            <section className="mt-6">
              <h3 className="text-xs uppercase tracking-[0.18em] text-accent-2 print:text-black/50">
                {copy.summary}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted print:text-black/80">
                {introduction}
              </p>
            </section>
          ) : null}

          {focusAreas.length > 0 ? (
            <section className="mt-6">
              <h3 className="text-xs uppercase tracking-[0.18em] text-accent-2 print:text-black/50">
                {t("resume.skills")}
              </h3>
              <div className="mt-3 space-y-3">
                {focusAreas.map((area) => (
                  <div key={area.id}>
                    <div className="text-sm font-medium text-ink print:text-black">
                      {pickLocalized(locale, area.title, area.titleEn)}
                    </div>
                    {area.tags?.length ? (
                      <p className="mt-1 text-xs text-ink-muted print:text-black/70">
                        {area.tags.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {grouped.map((group) => (
            <section key={group.type} className="mt-6">
              <h3 className="text-xs uppercase tracking-[0.18em] text-accent-2 print:text-black/50">
                {t(typeKeys[group.type] || "type.other")}
              </h3>
              <ul className="mt-3 space-y-4">
                {group.items.map((item) => {
                  const org = pickLocalized(locale, item.organization, item.organizationEn);
                  const itemRole = pickLocalized(locale, item.role, item.roleEn);
                  const desc = pickLocalized(locale, item.description, item.descriptionEn);
                  return (
                    <li key={item.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm font-medium text-ink print:text-black">
                          {org}
                          {itemRole ? ` — ${itemRole}` : ""}
                        </div>
                        <div className="text-xs text-ink-faint print:text-black/50">
                          {item.startDate || "?"}
                          {item.endDate ? ` – ${item.endDate}` : ` – ${copy.present}`}
                        </div>
                      </div>
                      {desc ? (
                        <p className="mt-1 text-sm text-ink-muted print:text-black/75">
                          {desc}
                        </p>
                      ) : null}
                      {item.skills?.length ? (
                        <p className="mt-1 text-xs text-ink-faint print:text-black/55">
                          {item.skills.join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {projects.length > 0 ? (
            <section className="mt-6">
              <h3 className="text-xs uppercase tracking-[0.18em] text-accent-2 print:text-black/50">
                {t("resume.projects")}
              </h3>
              <ul className="mt-3 space-y-4">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.slug}`}
                      className="text-sm font-medium text-ink hover:text-accent print:text-black"
                    >
                      {pickLocalized(locale, project.name, project.nameEn)}
                      <span className="ml-1 text-xs font-normal text-ink-faint print:hidden">
                        · {copy.caseStudy}
                      </span>
                    </Link>
                    {pickLocalized(locale, project.summary, project.summaryEn) ? (
                      <p className="mt-1 text-sm text-ink-muted print:text-black/75">
                        {pickLocalized(locale, project.summary, project.summaryEn)}
                      </p>
                    ) : null}
                    {project.techStack?.length ? (
                      <p className="mt-1 text-xs text-ink-faint print:text-black/55">
                        {project.techStack.join(" · ")}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      {project.repositoryUrl ? (
                        <a
                          href={project.repositoryUrl}
                          className="text-accent-2 print:text-black/70"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {copy.code}
                        </a>
                      ) : null}
                      {project.demoUrl ? (
                        <a
                          href={project.demoUrl}
                          className="text-accent-2 print:text-black/70"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {copy.live}
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-line pt-4 text-xs text-ink-faint print:border-black/20 print:text-black/50">
            {copy.source}: {siteUrl} · {copy.ask}: {siteUrl}/knowledge · {copy.generated}
          </footer>
        </article>
      </div>
    </>
  );
}
