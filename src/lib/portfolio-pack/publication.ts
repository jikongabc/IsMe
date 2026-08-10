import type {
  PortfolioPackPost,
  PortfolioPackProject,
  PortfolioPackPublicationAdjustment,
  PortfolioPackV1,
} from "./types";

export type PortfolioPackPublicationNormalization = {
  pack: PortfolioPackV1;
  adjustments: PortfolioPackPublicationAdjustment[];
};

function nonBlank(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function primary(locale: "zh" | "en", zh: string, en: string): string {
  return locale === "en" ? en.trim() || zh : zh;
}

function projectEvidenceIssues(
  project: PortfolioPackProject,
  locale: "zh" | "en",
): string[] {
  const issues: string[] = [];
  if (!nonBlank(primary(locale, project.summary, project.summaryEn))) issues.push("缺少项目摘要");
  if (!nonBlank(primary(locale, project.description, project.descriptionEn))) issues.push("缺少案例正文");
  if (!nonBlank(primary(locale, project.role, project.roleEn))) issues.push("缺少个人职责");
  if (!nonBlank(primary(locale, project.duration, project.durationEn))) issues.push("缺少项目周期");
  if (project.teamSize <= 0) issues.push("缺少团队规模");
  const hasMetric = project.metrics.some(
    (metric) =>
      nonBlank(primary(locale, metric.label, metric.labelEn)) &&
      nonBlank(primary(locale, metric.value, metric.valueEn)),
  );
  if (!hasMetric) issues.push("缺少可核验结果");
  const hasDecision = project.decisions.some(
    (decision) =>
      nonBlank(primary(locale, decision.title, decision.titleEn)) &&
      nonBlank(primary(locale, decision.tradeoff, decision.tradeoffEn)),
  );
  if (!hasDecision) issues.push("缺少技术取舍");
  return issues;
}

function postEvidenceIssues(post: PortfolioPackPost, locale: "zh" | "en"): string[] {
  const issues: string[] = [];
  if (!nonBlank(primary(locale, post.title, post.titleEn))) issues.push("缺少文章标题");
  if (!nonBlank(primary(locale, post.excerpt, post.excerptEn))) issues.push("缺少文章摘要");
  if (!nonBlank(primary(locale, post.contentMarkdown, post.contentEn))) issues.push("缺少文章正文");
  return issues;
}

/**
 * Produces a new pack and an explicit audit trail. Weak published content is
 * demoted; a complete post without a publication time remains publishable and
 * is assigned the supplied transaction timestamp only when one is provided.
 */
export function normalizePortfolioPackPublications(
  input: PortfolioPackV1,
  publicationTimestamp?: string,
): PortfolioPackPublicationNormalization {
  const locale = input.sections.appearance.defaultLocale;
  const adjustments: PortfolioPackPublicationAdjustment[] = [];

  const projects = input.sections.projects.map((project) => {
    if (project.status !== "published") return { ...project };
    const reasons = projectEvidenceIssues(project, locale);
    if (reasons.length === 0) return { ...project };
    adjustments.push({
      action: "demote-to-draft",
      section: "projects",
      slug: project.slug,
      label: project.name.trim() || project.nameEn.trim() || project.slug,
      from: "published",
      to: "draft",
      reasons,
    });
    return { ...project, status: "draft" as const };
  });

  const posts = input.sections.posts.map((post) => {
    if (post.status !== "published") return { ...post };
    const reasons = postEvidenceIssues(post, locale);
    if (reasons.length > 0) {
      adjustments.push({
        action: "demote-to-draft",
        section: "posts",
        slug: post.slug,
        label: post.title.trim() || post.titleEn.trim() || post.slug,
        from: "published",
        to: "draft",
        reasons,
      });
      return { ...post, status: "draft" as const, publishedAt: null };
    }
    if (post.publishedAt !== null) return { ...post };
    adjustments.push({
      action: "assign-published-at",
      section: "posts",
      slug: post.slug,
      label: post.title.trim() || post.titleEn.trim() || post.slug,
      from: "published",
      to: "published",
      reasons: ["缺少发布时间，应用时写入当前事务时间"],
    });
    return { ...post, publishedAt: publicationTimestamp ?? null };
  });

  return {
    pack: {
      ...input,
      sections: {
        ...input.sections,
        projects,
        posts,
      },
    },
    adjustments,
  };
}

export function portfolioProjectPublicationIssues(
  project: PortfolioPackProject,
  locale: "zh" | "en",
): string[] {
  return projectEvidenceIssues(project, locale);
}

export function portfolioPostPublicationIssues(
  post: PortfolioPackPost,
  locale: "zh" | "en",
): string[] {
  return postEvidenceIssues(post, locale);
}
