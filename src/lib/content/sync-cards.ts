import {
  getAdminProfile,
  listAdminExperiences,
  listAdminPosts,
  listAdminProjects,
  listAdminFocusAreas,
  listAdminSocialLinks,
} from "@/lib/content/queries";
import type {
  ProjectDecision,
  ProjectGalleryItem,
  ProjectMetric,
} from "@/lib/db/schema";

export type SyncCard = {
  key: string;
  title: string;
  text: string;
};

function clamp(text: string, max = 6000): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function pushCard(cards: SyncCard[], key: string, title: string, parts: Array<string | false | null | undefined>) {
  const text = clamp(parts.filter(Boolean).join("\n"));
  if (!text) return;
  cards.push({ key, title, text });
}

function localized(primary: string, english: string | undefined, useEnglish: boolean): string {
  return useEnglish ? english?.trim() || primary : primary;
}

function formatProjectMetrics(metrics: ProjectMetric[], useEnglish: boolean): string {
  if (!metrics.length) return "";
  const lines = metrics.map((metric) => {
    const label = localized(metric.label, metric.labelEn, useEnglish);
    const value = localized(metric.value, metric.valueEn, useEnglish);
    const context = localized(metric.context, metric.contextEn, useEnglish);
    return `- ${label}: ${value}${context ? ` — ${context}` : ""}`;
  });
  return [`## ${useEnglish ? "Measured outcomes" : "可量化成果"}`, ...lines].join("\n");
}

function formatProjectDecisions(decisions: ProjectDecision[], useEnglish: boolean): string {
  if (!decisions.length) return "";
  const lines = decisions.map((decision) => {
    const title = localized(decision.title, decision.titleEn, useEnglish);
    const tradeoff = localized(decision.tradeoff, decision.tradeoffEn, useEnglish);
    return `- ${title}: ${tradeoff}`;
  });
  return [`## ${useEnglish ? "Engineering decisions" : "关键技术取舍"}`, ...lines].join("\n");
}

function formatProjectGallery(gallery: ProjectGalleryItem[], useEnglish: boolean): string {
  if (!gallery.length) return "";
  const lines = gallery.map((item) => {
    const alt = localized(item.alt, item.altEn, useEnglish);
    const caption = localized(item.caption, item.captionEn, useEnglish);
    return `- ${alt}${caption ? ` — ${caption}` : ""} (${item.src})`;
  });
  return [`## ${useEnglish ? "Visual evidence" : "视觉证据"}`, ...lines].join("\n");
}

function boundedProjectSection(text: string, max: number): string {
  return text ? clamp(text, max) : "";
}

function formatProjectNarrative(text: string, useEnglish: boolean): string {
  if (!text.trim()) return "";
  return `## ${useEnglish ? "Case study narrative" : "案例正文"}\n${clamp(text, 1800)}`;
}

function hasEnglishProjectEvidence(project: {
  roleEn?: string;
  durationEn?: string;
  metrics?: ProjectMetric[];
  decisions?: ProjectDecision[];
  gallery?: ProjectGalleryItem[];
}): boolean {
  return Boolean(
    project.roleEn ||
      project.durationEn ||
      project.metrics?.some((item) => item.labelEn || item.valueEn || item.contextEn) ||
      project.decisions?.some((item) => item.titleEn || item.tradeoffEn) ||
      project.gallery?.some((item) => item.altEn || item.captionEn),
  );
}

/** Build derived-knowledge cards from published/visible site content (primary + EN). */
export async function buildSiteSyncCards(): Promise<SyncCard[]> {
  const [profile, links, areas, experiences, projects, posts] = await Promise.all([
    getAdminProfile(),
    listAdminSocialLinks(),
    listAdminFocusAreas(),
    listAdminExperiences(),
    listAdminProjects(),
    listAdminPosts(),
  ]);

  const cards: SyncCard[] = [];
  const linkLine = links
    .filter((l) => l.visible)
    .map((l) => `${l.label}: ${l.url}`)
    .join("\n");

  if (profile) {
    pushCard(cards, "profile", "Profile", [
      `# ${profile.displayName || profile.siteName || "Profile"}`,
      profile.role && `Role: ${profile.role}`,
      profile.headline && `Headline: ${profile.headline}`,
      profile.location && `Location: ${profile.location}`,
      profile.availability && `Availability: ${profile.availability}`,
      profile.publicEmail && `Email: ${profile.publicEmail}`,
      "",
      profile.introduction,
      linkLine && `\nLinks:\n${linkLine}`,
    ]);

    if (profile.roleEn || profile.headlineEn || profile.introductionEn || profile.availabilityEn) {
      pushCard(cards, "profile:en", "Profile (EN)", [
        `# ${profile.englishName || profile.displayName || profile.siteName || "Profile"}`,
        (profile.roleEn || profile.role) && `Role: ${profile.roleEn || profile.role}`,
        (profile.headlineEn || profile.headline) &&
          `Headline: ${profile.headlineEn || profile.headline}`,
        profile.location && `Location: ${profile.location}`,
        (profile.availabilityEn || profile.availability) &&
          `Availability: ${profile.availabilityEn || profile.availability}`,
        profile.publicEmail && `Email: ${profile.publicEmail}`,
        "",
        profile.introductionEn || profile.introduction,
        linkLine && `\nLinks:\n${linkLine}`,
      ]);
    }
  }

  for (const area of areas.filter((a) => a.visible)) {
    pushCard(cards, `focus:${area.id}`, `Focus: ${area.title}`, [
      `# Focus area: ${area.title}`,
      area.description,
      area.tags?.length ? `Tags: ${area.tags.join(", ")}` : "",
    ]);
    if (area.titleEn || area.descriptionEn) {
      pushCard(cards, `focus:${area.id}:en`, `Focus: ${area.titleEn || area.title} (EN)`, [
        `# Focus area: ${area.titleEn || area.title}`,
        area.descriptionEn || area.description,
        area.tags?.length ? `Tags: ${area.tags.join(", ")}` : "",
      ]);
    }
  }

  for (const exp of experiences.filter((e) => e.visible)) {
    pushCard(cards, `experience:${exp.id}`, `${exp.type}: ${exp.organization}`, [
      `# ${exp.type}: ${exp.organization}`,
      exp.role && `Role: ${exp.role}`,
      `Period: ${exp.startDate || "?"} – ${exp.endDate || "present"}`,
      exp.description,
      exp.skills?.length ? `Skills: ${exp.skills.join(", ")}` : "",
    ]);
    if (exp.organizationEn || exp.roleEn || exp.descriptionEn) {
      pushCard(
        cards,
        `experience:${exp.id}:en`,
        `${exp.type}: ${exp.organizationEn || exp.organization} (EN)`,
        [
          `# ${exp.type}: ${exp.organizationEn || exp.organization}`,
          (exp.roleEn || exp.role) && `Role: ${exp.roleEn || exp.role}`,
          `Period: ${exp.startDate || "?"} – ${exp.endDate || "present"}`,
          exp.descriptionEn || exp.description,
          exp.skills?.length ? `Skills: ${exp.skills.join(", ")}` : "",
        ],
      );
    }
  }

  for (const project of projects.filter((p) => p.status === "published")) {
    pushCard(cards, `project:${project.slug}`, `Project: ${project.name}`, [
      `# Project: ${project.name}`,
      project.role && `Role: ${project.role}`,
      project.teamSize > 0 && `Team size: ${project.teamSize}`,
      project.duration && `Duration: ${project.duration}`,
      project.techStack?.length ? `Tech: ${project.techStack.join(", ")}` : "",
      project.summary,
      project.repositoryUrl && `Repository: ${project.repositoryUrl}`,
      project.demoUrl && `Demo: ${project.demoUrl}`,
      boundedProjectSection(formatProjectGallery(project.gallery ?? [], false), 900),
      boundedProjectSection(formatProjectMetrics(project.metrics ?? [], false), 1400),
      boundedProjectSection(formatProjectDecisions(project.decisions ?? [], false), 1800),
      formatProjectNarrative(project.description, false),
    ]);
    if (
      project.nameEn ||
      project.summaryEn ||
      project.descriptionEn ||
      hasEnglishProjectEvidence(project)
    ) {
      pushCard(cards, `project:${project.slug}:en`, `Project: ${project.nameEn || project.name} (EN)`, [
        `# Project: ${project.nameEn || project.name}`,
        (project.roleEn || project.role) && `Role: ${project.roleEn || project.role}`,
        project.teamSize > 0 && `Team size: ${project.teamSize}`,
        (project.durationEn || project.duration) &&
          `Duration: ${project.durationEn || project.duration}`,
        project.techStack?.length ? `Tech: ${project.techStack.join(", ")}` : "",
        project.summaryEn || project.summary,
        project.repositoryUrl && `Repository: ${project.repositoryUrl}`,
        project.demoUrl && `Demo: ${project.demoUrl}`,
        boundedProjectSection(formatProjectGallery(project.gallery ?? [], true), 900),
        boundedProjectSection(formatProjectMetrics(project.metrics ?? [], true), 1400),
        boundedProjectSection(formatProjectDecisions(project.decisions ?? [], true), 1800),
        formatProjectNarrative(project.descriptionEn || project.description, true),
      ]);
    }
  }

  for (const post of posts.filter((p) => p.status === "published")) {
    pushCard(cards, `post:${post.slug}`, `Post: ${post.title}`, [
      `# Blog: ${post.title}`,
      post.category && `Category: ${post.category}`,
      post.tags?.length ? `Tags: ${post.tags.join(", ")}` : "",
      post.excerpt,
      "",
      post.contentMarkdown,
    ]);
    if (post.titleEn || post.excerptEn || post.contentEn) {
      pushCard(cards, `post:${post.slug}:en`, `Post: ${post.titleEn || post.title} (EN)`, [
        `# Blog: ${post.titleEn || post.title}`,
        post.category && `Category: ${post.category}`,
        post.tags?.length ? `Tags: ${post.tags.join(", ")}` : "",
        post.excerptEn || post.excerpt,
        "",
        post.contentEn || post.contentMarkdown,
      ]);
    }
  }

  return cards;
}
