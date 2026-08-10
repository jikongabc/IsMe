import { demoSeed } from "@/data/demo-seed";
import { SITE_THEMES } from "@/lib/theme";
import { parsePortfolioPack } from "./schema";
import {
  PORTFOLIO_PACK_SECTIONS,
  PORTFOLIO_PACK_VERSION,
  type PortfolioPackKnowledgeBase,
  type PortfolioPackPost,
  type PortfolioPackProfile,
  type PortfolioPackProject,
  type PortfolioPackSection,
  type PortfolioPackSections,
  type PortfolioPackV1,
} from "./types";

export function createBlankPortfolioPack(
  exportedAt = new Date().toISOString(),
): PortfolioPackV1 {
  return parsePortfolioPack({
    version: PORTFOLIO_PACK_VERSION,
    exportedAt,
    sections: {
      profile: {
        siteName: "IsMe",
        displayName: "",
        englishName: "",
        role: "",
        roleEn: "",
        headline: "",
        headlineEn: "",
        introduction: "",
        introductionEn: "",
        avatarUrl: "",
        location: "",
        publicEmail: "",
        availability: "",
        availabilityEn: "",
      },
      appearance: {
        theme: "terminal",
        defaultLocale: "zh",
        enabledThemes: [...SITE_THEMES],
        accent: "",
        accent2: "",
      },
      socialLinks: [],
      focusAreas: [],
      experiences: [],
      projects: [],
      posts: [],
      knowledgeBases: [],
    },
  });
}

/** A safe starting candidate: no invented identity, résumé claims, projects, or bindings. */
export function createStarterPortfolioPack(
  exportedAt = new Date().toISOString(),
): PortfolioPackV1 {
  return createBlankPortfolioPack(exportedAt);
}

const PROFILE_FIELDS = [
  "siteName",
  "displayName",
  "englishName",
  "role",
  "roleEn",
  "headline",
  "headlineEn",
  "introduction",
  "introductionEn",
  "avatarUrl",
  "location",
  "publicEmail",
  "availability",
  "availabilityEn",
] as const satisfies readonly (keyof PortfolioPackProfile)[];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function demoProfile(): PortfolioPackProfile {
  return {
    siteName: demoSeed.profile.siteName,
    displayName: demoSeed.profile.displayName,
    englishName: demoSeed.profile.englishName,
    role: demoSeed.profile.role,
    roleEn: demoSeed.profile.roleEn,
    headline: demoSeed.profile.headline,
    headlineEn: demoSeed.profile.headlineEn,
    introduction: demoSeed.profile.introduction,
    introductionEn: demoSeed.profile.introductionEn,
    avatarUrl: demoSeed.profile.avatarUrl,
    location: demoSeed.profile.location,
    publicEmail: demoSeed.profile.publicEmail,
    availability: demoSeed.profile.availability,
    availabilityEn: demoSeed.profile.availabilityEn,
  };
}

function demoProjects(): PortfolioPackProject[] {
  return demoSeed.projects.map((project) => ({
    ...project,
    techStack: [...project.techStack],
    metrics: project.metrics.map((metric) => ({ ...metric })),
    decisions: project.decisions.map((decision) => ({ ...decision })),
    gallery: [],
  }));
}

function demoPosts(): PortfolioPackPost[] {
  return demoSeed.posts.map((post) => ({
    title: post.title,
    titleEn: "titleEn" in post ? post.titleEn : "",
    slug: post.slug,
    excerpt: post.excerpt,
    excerptEn: "excerptEn" in post ? post.excerptEn : "",
    contentMarkdown: post.contentMarkdown,
    contentEn: "contentEn" in post ? post.contentEn : "",
    contentFormat: "contentFormat" in post ? post.contentFormat : "markdown",
    coverUrl: post.coverUrl,
    category: post.category,
    tags: [...post.tags],
    status: post.status,
    publishedAt: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
  }));
}

function demoKnowledgeBases(): PortfolioPackKnowledgeBase[] {
  return demoSeed.knowledgeBases.map((knowledgeBase) => ({
    name: knowledgeBase.name,
    nameEn: knowledgeBase.nameEn,
    slug: knowledgeBase.slug,
    description: knowledgeBase.description,
    descriptionEn: knowledgeBase.descriptionEn,
    welcomeMessage: knowledgeBase.welcomeMessage,
    welcomeMessageEn: knowledgeBase.welcomeMessageEn,
    suggestedQuestions: [...knowledgeBase.suggestedQuestions],
    suggestedQuestionsEn: [...knowledgeBase.suggestedQuestionsEn],
    sortOrder: knowledgeBase.sortOrder,
  }));
}

function comparablePost(post: PortfolioPackPost) {
  const content: Partial<PortfolioPackPost> = { ...post };
  delete content.publishedAt;
  delete content.updatedAt;
  return content;
}

function demoCollectionRecords(section: Exclude<PortfolioPackSection, "profile" | "appearance">) {
  switch (section) {
    case "socialLinks":
      return demoSeed.socialLinks.map((item) => ({ ...item }));
    case "focusAreas":
      return demoSeed.focusAreas.map((item) => ({ ...item, tags: [...item.tags] }));
    case "experiences":
      return demoSeed.experiences.map((item) => ({ ...item, skills: [...item.skills] }));
    case "projects":
      return demoProjects();
    case "posts":
      return demoPosts().map(comparablePost);
    case "knowledgeBases":
      return demoKnowledgeBases();
  }
}

function isExactDemoRecord(
  section: Exclude<PortfolioPackSection, "profile" | "appearance">,
  record: unknown,
): boolean {
  const comparable = section === "posts" ? comparablePost(record as PortfolioPackPost) : record;
  const value = canonical(comparable);
  return demoCollectionRecords(section).some((demo) => canonical(demo) === value);
}

export function getPortfolioPackDemoExactMatchCounts(
  input: PortfolioPackV1,
): Record<PortfolioPackSection, number> {
  const pack = parsePortfolioPack(input);
  const blank = createBlankPortfolioPack(pack.exportedAt);
  const demo = demoProfile();
  const counts = Object.fromEntries(
    PORTFOLIO_PACK_SECTIONS.map((section) => [section, 0]),
  ) as Record<PortfolioPackSection, number>;

  counts.profile = PROFILE_FIELDS.filter(
    (field) => demo[field] !== blank.sections.profile[field] && pack.sections.profile[field] === demo[field],
  ).length;
  for (const section of PORTFOLIO_PACK_SECTIONS) {
    if (section === "profile" || section === "appearance") continue;
    counts[section] = pack.sections[section].filter((record) =>
      isExactDemoRecord(section, record),
    ).length;
  }
  return counts;
}

export function isPortfolioPackSectionEmptyOrDemoOnly(
  input: PortfolioPackV1,
  section: PortfolioPackSection,
): boolean {
  const pack = parsePortfolioPack(input);
  const blank = createBlankPortfolioPack(pack.exportedAt);
  if (section === "appearance") {
    return canonical(pack.sections.appearance) === canonical(blank.sections.appearance);
  }
  if (section === "profile") {
    const demo = demoProfile();
    return PROFILE_FIELDS.every((field) => {
      const value = pack.sections.profile[field];
      return value === blank.sections.profile[field] || value === demo[field];
    });
  }
  const records = pack.sections[section];
  return records.length === 0 || records.every((record) => isExactDemoRecord(section, record));
}

/**
 * Clears only known seed values. Profile fields are handled independently so
 * editing a name does not preserve unrelated demo role/headline/email fields.
 * Collection rows are removed only when every portable seed field still matches.
 */
export function createDemoCleanupCandidate(input: PortfolioPackV1): PortfolioPackV1 {
  const pack = parsePortfolioPack(input);
  const blank = createBlankPortfolioPack(pack.exportedAt);
  const demo = demoProfile();
  const profile = { ...pack.sections.profile };
  for (const field of PROFILE_FIELDS) {
    if (demo[field] !== blank.sections.profile[field] && profile[field] === demo[field]) {
      profile[field] = blank.sections.profile[field];
    }
  }

  const sections: PortfolioPackSections = {
    ...pack.sections,
    profile,
    appearance: { ...pack.sections.appearance, enabledThemes: [...pack.sections.appearance.enabledThemes] },
    socialLinks: pack.sections.socialLinks.filter(
      (record) => !isExactDemoRecord("socialLinks", record),
    ),
    focusAreas: pack.sections.focusAreas.filter(
      (record) => !isExactDemoRecord("focusAreas", record),
    ),
    experiences: pack.sections.experiences.filter(
      (record) => !isExactDemoRecord("experiences", record),
    ),
    projects: pack.sections.projects.filter(
      (record) => !isExactDemoRecord("projects", record),
    ),
    posts: pack.sections.posts.filter((record) => !isExactDemoRecord("posts", record)),
    knowledgeBases: pack.sections.knowledgeBases.filter(
      (record) => !isExactDemoRecord("knowledgeBases", record),
    ),
  };
  return parsePortfolioPack({ ...pack, sections });
}
