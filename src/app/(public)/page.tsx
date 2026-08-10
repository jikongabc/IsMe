import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { Section } from "@/components/site/Section";
import { pickLocalized } from "@/lib/content/localize";
import { getPublicSiteBundle, listPublishedPosts } from "@/lib/content/queries";
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
  const title = profile?.displayName || profile?.siteName || "IsMe";
  const description = pickLocalized(
    locale,
    profile?.headline || profile?.introduction || "Personal homepage",
    profile?.headlineEn || profile?.introductionEn,
  );
  return {
    title,
    description,
    alternates: { canonical: getEnv().SITE_URL },
    openGraph: {
      type: "profile",
      title,
      description,
      url: getEnv().SITE_URL,
    },
  };
}

const typeKeys: Record<string, MessageKey> = {
  work: "type.work",
  education: "type.education",
  project: "type.project",
  competition: "type.competition",
  other: "type.other",
};

function isDemoProfile(profile: {
  siteName?: string;
  publicEmail?: string;
  displayName?: string;
} | null): boolean {
  if (!profile) return true;
  return (
    /\bdemo\b/i.test(profile.siteName || "") ||
    /@example\.com$/i.test(profile.publicEmail || "") ||
    profile.displayName === "Alex River"
  );
}

export default async function HomePage() {
  const [bundle, posts, locale] = await Promise.all([
    getPublicSiteBundle(),
    listPublishedPosts(),
    getRequestLocale(),
  ]);
  const {
    profile,
    focusAreas,
    experiences,
    featuredProjects,
    socialLinks,
    knowledgeBases,
  } = bundle;

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const brand = profile?.displayName || profile?.siteName || "IsMe";
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
  const demo = isDemoProfile(profile);

  const guide =
    locale === "zh"
      ? {
          label: "面试导览",
          title: "从一条证据开始",
          work: "项目案例",
          workDetail: `${featuredProjects.length} 个精选项目，包含实现与取舍`,
          experience: "经历脉络",
          experienceDetail: `${experiences.length} 个可核对的角色与节点`,
          ask: "直接追问",
          askDetail: `${knowledgeBases.length} 个基于资料的问答主题`,
          demo: "当前仍是模板占位资料。写入简历前，请先在后台替换姓名、邮箱、经历与项目链接。",
          setup: "打开后台完成设置 →",
        }
      : {
          label: "Interview guide",
          title: "Start with one piece of evidence",
          work: "Project cases",
          workDetail: `${featuredProjects.length} selected projects with implementation detail`,
          experience: "Experience",
          experienceDetail: `${experiences.length} roles and milestones to verify`,
          ask: "Ask directly",
          askDetail: `${knowledgeBases.length} source-grounded topics`,
          demo: "This site still contains template data. Replace the name, email, experience, and project links before sharing it on a résumé.",
          setup: "Open admin setup →",
        };

  return (
    <>
      <JsonLd
        data={personJsonLd({
          name: brand,
          jobTitle: role || undefined,
          description: headline || introduction || undefined,
          email: profile?.publicEmail || undefined,
          location: profile?.location || undefined,
          image: profile?.avatarUrl || undefined,
          sameAs: socialLinks.map((link) => link.url),
        })}
      />

      {demo ? (
        <div className="demo-banner" role="status">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between md:px-6">
            <span>{guide.demo}</span>
            <Link href="/admin" className="shrink-0 font-medium text-ink underline underline-offset-4">
              {guide.setup}
            </Link>
          </div>
        </div>
      ) : null}

      <section className="hero-shell atmosphere relative overflow-hidden border-b border-line">
        <div className="hero-grid absolute inset-0" />
        <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-12 px-4 py-16 md:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:py-24">
          <div className="animate-rise max-w-3xl">
            <div className="hero-kicker">
              <span className="status-dot" aria-hidden="true" />
              {availability || t("home.idle")}
            </div>
            <div className="mt-7 flex items-center gap-5">
              {profile?.avatarUrl ? (
                // Remote upload hosts are configured at runtime, so a fixed-size img is intentional.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt=""
                  width={88}
                  height={88}
                  className="h-20 w-20 rounded-2xl border border-line object-cover shadow-lg md:h-24 md:w-24"
                />
              ) : null}
              <div>
                <h1 className="font-display text-5xl font-semibold tracking-[-0.055em] text-ink sm:text-6xl lg:text-7xl">
                  {brand}
                </h1>
                {role ? <p className="mt-2 text-base font-medium text-accent md:text-lg">{role}</p> : null}
              </div>
            </div>
            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-ink-muted sm:text-2xl">
              {headline || t("home.defaultHeadline")}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/projects" className="btn-primary">
                {t("home.ctaProjects")}
              </Link>
              <Link href="/knowledge" className="btn-ghost">
                {t("home.ctaChat")}
              </Link>
              <Link href="/resume" className="btn-text">
                {t("home.ctaResume")} <span aria-hidden="true">→</span>
              </Link>
            </div>
            {socialLinks.length > 0 ? (
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
                {socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    className="inline-flex items-center gap-1 transition hover:text-accent"
                    target={link.url.startsWith("http") ? "_blank" : undefined}
                    rel={link.url.startsWith("http") ? "noreferrer" : undefined}
                  >
                    {link.label}
                    {link.url.startsWith("http") ? <span aria-hidden="true">↗</span> : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="proof-panel animate-rise-delay" aria-label={guide.label}>
            <p className="section-kicker">{guide.label}</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">
              {guide.title}
            </h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              <Link href="/projects" className="proof-link">
                <span>
                  <strong>{guide.work}</strong>
                  <small>{guide.workDetail}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/#experience" className="proof-link">
                <span>
                  <strong>{guide.experience}</strong>
                  <small>{guide.experienceDetail}</small>
                </span>
                <span aria-hidden="true">↓</span>
              </Link>
              <Link href="/knowledge" className="proof-link">
                <span>
                  <strong>{guide.ask}</strong>
                  <small>{guide.askDetail}</small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <Section
        id="projects"
        eyebrow={t("home.projectsEyebrow")}
        title={t("home.projectsTitle")}
        description={t("home.projectsDesc")}
      >
        {featuredProjects.length === 0 ? (
          <p className="text-ink-muted">{t("home.projectsEmpty")}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {featuredProjects.map((project) => {
              const name = pickLocalized(locale, project.name, project.nameEn);
              const leadMetric = project.metrics?.[0];
              return (
                <article key={project.id} className="project-card group">
                  {project.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={project.coverUrl}
                      alt={`${name} ${locale === "zh" ? "项目预览" : "project preview"}`}
                      width={720}
                      height={400}
                      className="aspect-[16/9] w-full border-b border-line object-cover"
                    />
                  ) : (
                    <div className="project-artifact" aria-hidden="true">
                      <span>{name.slice(0, 2).toUpperCase()}</span>
                      <span>{project.techStack.slice(0, 3).join(" · ")}</span>
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-2xl font-semibold tracking-tight text-ink group-hover:text-accent">
                      {name}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                      {pickLocalized(locale, project.summary, project.summaryEn)}
                    </p>
                    {leadMetric ? (
                      <div className="project-proof" aria-label={locale === "zh" ? "项目成果" : "Project outcome"}>
                        <strong>
                          {pickLocalized(locale, leadMetric.value, leadMetric.valueEn ?? "")}
                        </strong>
                        <span>
                          {pickLocalized(locale, leadMetric.label, leadMetric.labelEn ?? "")}
                        </span>
                      </div>
                    ) : null}
                    {project.techStack?.length ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {project.techStack.map((tech) => (
                          <span key={tech} className="tag-chip">
                            {tech}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Link href={`/projects/${project.slug}`} className="mt-6 text-sm font-semibold text-accent">
                      {t("home.projectsReadme")}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="mt-8">
          <Link href="/projects" className="btn-text">
            {t("home.projectsAll")}
          </Link>
        </div>
      </Section>

      {introduction || focusAreas.length > 0 ? (
        <section className="border-y border-line bg-bg-elevated/45">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="section-kicker">{t("home.aboutEyebrow")}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                {t("home.aboutTitle")}
              </h2>
              {profile?.location ? (
                <p className="mt-4 text-sm text-ink-faint">{profile.location}</p>
              ) : null}
              {introduction ? (
                <p className="mt-6 whitespace-pre-wrap text-base leading-8 text-ink-muted">
                  {introduction}
                </p>
              ) : null}
            </div>
            {focusAreas.length > 0 ? (
              <div>
                <p className="section-kicker">{t("home.skillsEyebrow")}</p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
                  {t("home.skillsTitle")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t("home.skillsDesc")}</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {focusAreas.map((area) => (
                    <div key={area.id} className="portfolio-card p-5">
                      <h3 className="font-display text-lg font-semibold text-ink">
                        {pickLocalized(locale, area.title, area.titleEn)}
                      </h3>
                      {pickLocalized(locale, area.description, area.descriptionEn) ? (
                        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                          {pickLocalized(locale, area.description, area.descriptionEn)}
                        </p>
                      ) : null}
                      {area.tags?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {area.tags.map((tag) => (
                            <span key={tag} className="tag-chip">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {experiences.length > 0 ? (
        <Section
          id="experience"
          eyebrow={t("home.xpEyebrow")}
          title={t("home.xpTitle")}
          description={t("home.xpDesc")}
        >
          <ol className="experience-rail">
            {experiences.map((item) => (
              <li key={item.id} className="experience-item">
                <div className="experience-date">
                  {item.startDate || "—"}
                  <span aria-hidden="true"> → </span>
                  {item.endDate || "Now"}
                </div>
                <div>
                  <p className="section-kicker">{t(typeKeys[item.type] || "type.other")}</p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-ink">
                    {pickLocalized(locale, item.organization, item.organizationEn)}
                  </h3>
                  {pickLocalized(locale, item.role, item.roleEn) ? (
                    <p className="mt-1 text-sm font-medium text-accent">
                      {pickLocalized(locale, item.role, item.roleEn)}
                    </p>
                  ) : null}
                  {pickLocalized(locale, item.description, item.descriptionEn) ? (
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
                      {pickLocalized(locale, item.description, item.descriptionEn)}
                    </p>
                  ) : null}
                  {item.skills?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.skills.map((skill) => (
                        <span key={skill} className="tag-chip">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {posts.length > 0 ? (
        <section className="border-t border-line bg-bg-elevated/45">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <div className="section-heading max-w-3xl">
              <p className="section-kicker">{t("home.blogEyebrow")}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                {t("home.blogTitle")}
              </h2>
              <p className="mt-3 text-ink-muted">{t("home.blogDesc")}</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {posts.slice(0, 3).map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`} className="portfolio-card block p-5">
                  <p className="font-mono text-[0.7rem] uppercase tracking-wider text-ink-faint">
                    {post.category || "Note"}
                    {post.publishedAt ? ` · ${post.publishedAt.slice(0, 10)}` : ""}
                  </p>
                  <h3 className="mt-4 font-display text-xl font-semibold text-ink">
                    {pickLocalized(locale, post.title, post.titleEn)}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                    {pickLocalized(locale, post.excerpt, post.excerptEn)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="rag-section border-y border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:px-6 lg:grid-cols-[1fr_auto] lg:items-end lg:py-20">
          <div className="max-w-2xl">
            <p className="section-kicker">{t("home.ragEyebrow")}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {t("home.ragTitle")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted">
              {knowledgeBases.length > 0
                ? t("home.ragReady", { count: knowledgeBases.length })
                : t("home.ragEmpty")}
            </p>
          </div>
          <Link href="/knowledge" className="btn-primary">
            {t("home.ragOpen")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
