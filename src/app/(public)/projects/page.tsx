import Link from "next/link";
import type { Metadata } from "next";
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
    title: translate(locale, "projects.title"),
    description: translate(locale, "projects.desc"),
    alternates: { canonical: "/projects" },
  };
}

export default async function ProjectsPage() {
  const [{ projects }, locale] = await Promise.all([
    getPublicSiteBundle(),
    getRequestLocale(),
  ]);

  return (
    <Section
      eyebrow={translate(locale, "projects.eyebrow")}
      title={translate(locale, "projects.title")}
      description={translate(locale, "projects.desc")}
      headingLevel={1}
    >
      {projects.length === 0 ? (
        <p className="text-ink-muted">{translate(locale, "projects.empty")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {projects.map((project, index) => {
            const name = pickLocalized(locale, project.name, project.nameEn);
            const summary = pickLocalized(locale, project.summary, project.summaryEn);
            const leadMetric = project.metrics?.[0];
            const galleryPreview = project.gallery?.[0];
            const previewUrl = project.coverUrl || galleryPreview?.src;
            const previewAlt = project.coverUrl
              ? locale === "zh"
                ? `${name} 项目预览`
                : `${name} project preview`
              : pickLocalized(locale, galleryPreview?.alt ?? "", galleryPreview?.altEn ?? "") ||
                (locale === "zh" ? `${name} 项目成果` : `${name} project outcome`);
            const caseStudyLabel =
              locale === "zh"
                ? `项目案例 ${String(index + 1).padStart(2, "0")}`
                : `Case study ${String(index + 1).padStart(2, "0")}`;

            return (
              <article key={project.id} className="project-card group flex flex-col">
                <Link
                  href={`/projects/${project.slug}`}
                  className="flex h-full flex-col"
                  aria-label={`${name} — ${translate(locale, "home.projectsReadme")}`}
                >
                  {previewUrl ? (
                    // Project media URLs are managed by the site owner and can be local or remote.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={previewAlt}
                      loading="lazy"
                      decoding="async"
                      className="aspect-video w-full border-b border-line object-cover"
                    />
                  ) : (
                    <div className="project-artifact" aria-hidden="true">
                      <span>{name.slice(0, 2).toUpperCase()}</span>
                      <span>
                        {project.techStack.slice(0, 3).join(" · ") ||
                          (locale === "zh" ? "案例档案" : "Case file")}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-5 md:p-6">
                    <p className="section-kicker">{caseStudyLabel}</p>
                    <h2 className="mt-3 font-display text-2xl tracking-tight text-ink transition group-hover:text-accent">
                      {name}
                    </h2>
                    {summary ? (
                      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                        {summary}
                      </p>
                    ) : null}

                    {leadMetric ? (
                      <div
                        className="project-proof"
                        aria-label={locale === "zh" ? "项目成果" : "Project outcome"}
                      >
                        <strong>
                          {pickLocalized(locale, leadMetric.value, leadMetric.valueEn ?? "")}
                        </strong>
                        <span>
                          {pickLocalized(locale, leadMetric.label, leadMetric.labelEn ?? "")}
                        </span>
                      </div>
                    ) : null}

                    {project.techStack?.length ? (
                      <div
                        className="mt-5 flex flex-wrap gap-2"
                        aria-label={locale === "zh" ? "技术栈" : "Technology stack"}
                      >
                        {project.techStack.map((tech) => (
                          <span key={tech} className="tag-chip">
                            {tech}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <span className="mt-6 text-sm font-semibold text-accent">
                      {translate(locale, "home.projectsReadme")}
                    </span>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}
