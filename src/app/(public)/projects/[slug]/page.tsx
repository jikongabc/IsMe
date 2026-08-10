import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RichContent } from "@/components/content/RichContent";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  buildProjectEvidence,
  ProjectDecisionLog,
  ProjectEvidenceLedger,
  ProjectGallery,
} from "@/app/(public)/projects/_components/ProjectEvidence";
import { normalizeContentFormat } from "@/lib/content/format";
import { pickLocalized } from "@/lib/content/localize";
import { getPublishedProjectBySlug } from "@/lib/content/queries";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";
import { projectJsonLd, siteBase } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [project, locale] = await Promise.all([
    getPublishedProjectBySlug(slug),
    getRequestLocale(),
  ]);
  if (!project) return { title: "project" };
  const name = pickLocalized(locale, project.name, project.nameEn);
  const summary = pickLocalized(locale, project.summary, project.summaryEn);
  const body = pickLocalized(locale, project.description, project.descriptionEn);
  const description = summary || body.slice(0, 160);
  const url = `${siteBase()}/projects/${project.slug}`;
  const evidence = buildProjectEvidence(project, locale, name);
  const shareImage = project.coverUrl || evidence.gallery[0]?.src;
  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: name,
      description,
      url,
      images: shareImage ? [{ url: shareImage, alt: name }] : undefined,
    },
  };
}

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const [project, locale] = await Promise.all([
    getPublishedProjectBySlug(slug),
    getRequestLocale(),
  ]);
  if (!project) notFound();

  const name = pickLocalized(locale, project.name, project.nameEn);
  const summary = pickLocalized(locale, project.summary, project.summaryEn);
  const description = pickLocalized(locale, project.description, project.descriptionEn);
  const format = normalizeContentFormat(project.contentFormat);
  const evidence = buildProjectEvidence(project, locale, name);
  const projectImage = project.coverUrl || evidence.gallery[0]?.src;
  const copy =
    locale === "zh"
      ? {
          eyebrow: "项目案例",
          overview: "案例正文",
          overviewDesc: "问题背景、关键取舍、实现过程与复盘。",
          resources: "项目资源",
          stack: "技术栈",
          links: "进一步查看",
          noBody: "这个项目的完整案例说明正在整理中。",
          coverAlt: `${name} 项目界面或成果预览`,
        }
      : {
          eyebrow: "Project case study",
          overview: "Case study",
          overviewDesc: "Context, key trade-offs, implementation, and reflection.",
          resources: "Project resources",
          stack: "Technology",
          links: "Explore further",
          noBody: "The full case study for this project is being prepared.",
          coverAlt: `${name} interface or outcome preview`,
        };

  return (
    <article className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
      <JsonLd
        data={projectJsonLd({
          name,
          description: summary || description.slice(0, 240),
          url: `${siteBase()}/projects/${project.slug}`,
          image: projectImage || undefined,
          codeRepository: project.repositoryUrl || undefined,
          demoUrl: project.demoUrl || undefined,
        })}
      />
      <Link href="/projects" className="btn-text text-sm">
        {translate(locale, "projects.back")}
      </Link>

      <header className="mt-8 max-w-4xl">
        <p className="section-kicker">{copy.eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] text-ink md:text-6xl">
          {name}
        </h1>
        {summary ? (
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-muted md:text-xl">
            {summary}
          </p>
        ) : null}
      </header>

      {project.coverUrl ? (
        // Project cover URLs are managed by the site owner and can be local or remote.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.coverUrl}
          alt={copy.coverAlt}
          decoding="async"
          className="mt-10 aspect-[16/8] w-full rounded-2xl border border-line object-cover shadow-xl"
        />
      ) : null}

      <ProjectEvidenceLedger evidence={evidence} locale={locale} />

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8">
          <ProjectDecisionLog decisions={evidence.decisions} locale={locale} />

          <section className="portfolio-card" aria-labelledby="case-study-heading">
            <h2 id="case-study-heading" className="font-display text-2xl text-ink">
              {copy.overview}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-faint">{copy.overviewDesc}</p>
            {description ? (
              <RichContent
                content={description}
                format={format}
                className="prose-isme mt-6"
                demoteHeadings
              />
            ) : (
              <p className="mt-5 text-sm text-ink-muted">{copy.noBody}</p>
            )}
          </section>
        </div>

        <aside className="portfolio-card lg:sticky lg:top-24" aria-labelledby="project-resources">
          <h2 id="project-resources" className="font-display text-xl text-ink">
            {copy.resources}
          </h2>

          {project.techStack?.length ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {copy.stack}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {project.techStack.map((tech) => (
                  <span key={tech} className="tag-chip">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {copy.links}
            </h3>
            <div className="mt-3 flex flex-col items-stretch gap-2 text-sm">
              {project.repositoryUrl ? (
                <a
                  href={project.repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                >
                  {translate(locale, "projects.clone")}
                </a>
              ) : null}
              {project.demoUrl ? (
                <a
                  href={project.demoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                >
                  {translate(locale, "projects.demo")}
                </a>
              ) : null}
              <Link href="/knowledge" className="btn-text justify-start">
                {translate(locale, "projects.ask")}
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <ProjectGallery items={evidence.gallery} locale={locale} />
    </article>
  );
}
