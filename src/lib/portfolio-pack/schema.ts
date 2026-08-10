import { z } from "zod";
import {
  PORTFOLIO_PACK_SECTIONS,
  PORTFOLIO_PACK_VERSION,
  type PortfolioPackV1,
} from "./types";

export const PORTFOLIO_PACK_MAX_ENTITIES = 500;
export const PORTFOLIO_PACK_MAX_MEDIA_REFERENCES = 500;

export const portfolioPackSectionSchema = z.enum(PORTFOLIO_PACK_SECTIONS);
export const portfolioPackSelectionSchema = z
  .array(portfolioPackSectionSchema)
  .max(PORTFOLIO_PACK_SECTIONS.length)
  .superRefine((selection, context) => {
    if (new Set(selection).size !== selection.length) {
      context.addIssue({ code: "custom", message: "selected sections must be unique" });
    }
  });

const siteThemeSchema = z.enum(["terminal", "ocean", "day", "ember", "slate"]);
const contentFormatSchema = z.enum(["markdown", "html"]);
const publicationStatusSchema = z.enum(["draft", "published", "archived"]);
const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");
const isoDateTimeSchema = z.string().datetime({ offset: true });
const hexColorSchema = z
  .string()
  .max(16)
  .refine((value) => value === "" || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value), {
    message: "must be empty, #RGB, or #RRGGBB",
  });

function isSafeRelativeUrl(value: string): boolean {
  if (!/^\/[\w./\-?&=%#~+:,@]*$/i.test(value) || value.startsWith("//")) return false;
  const encodedPath = value.split(/[?#]/, 1)[0] ?? value;
  try {
    const decodedPath = decodeURIComponent(encodedPath);
    return (
      !decodedPath.startsWith("//") &&
      !decodedPath.includes("\\") &&
      !decodedPath.split("/").includes("..")
    );
  } catch {
    return false;
  }
}

function isSafeAbsoluteUrl(value: string, protocols: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSafeHttpUrl(value: string): boolean {
  const candidate = value.trim();
  return (
    candidate === "" ||
    isSafeRelativeUrl(candidate) ||
    isSafeAbsoluteUrl(candidate, ["http:", "https:"])
  );
}

function isSafeImageUrl(value: string): boolean {
  const candidate = value.trim();
  return (
    candidate === "" ||
    isSafeRelativeUrl(candidate) ||
    isSafeAbsoluteUrl(candidate, ["https:"])
  );
}

function isSafePublicLink(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || /[\r\n]/.test(candidate)) return false;
  if (isSafeRelativeUrl(candidate) || isSafeAbsoluteUrl(candidate, ["http:", "https:"])) {
    return true;
  }
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "mailto:" &&
      !url.search &&
      !url.hash &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const safeHttpUrlSchema = z.string().max(500).refine(isSafeHttpUrl, {
  message: "must be an http(s) URL without credentials or a safe site-relative path",
});
const safeImageUrlSchema = z.string().max(500).refine(isSafeImageUrl, {
  message: "must be an HTTPS URL without credentials or a safe site-relative path",
});
const safePublicLinkSchema = z.string().min(1).max(500).refine(isSafePublicLink, {
  message: "must be an http(s), mailto, or safe site-relative URL without credentials",
});

const shortListItemSchema = z
  .string()
  .max(60)
  .refine((value) => value.trim().length > 0, { message: "list items cannot be blank" });

export const portfolioPackProfileSchema = z
  .object({
    siteName: z.string().min(1).max(120),
    displayName: z.string().max(120),
    englishName: z.string().max(120),
    role: z.string().max(200),
    roleEn: z.string().max(200),
    headline: z.string().max(400),
    headlineEn: z.string().max(400),
    introduction: z.string().max(8000),
    introductionEn: z.string().max(8000),
    avatarUrl: safeImageUrlSchema,
    location: z.string().max(120),
    publicEmail: z
      .string()
      .max(200)
      .refine(
        (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "must be empty or a valid email address",
      ),
    availability: z.string().max(200),
    availabilityEn: z.string().max(200),
  })
  .strict();

export const portfolioPackAppearanceSchema = z
  .object({
    theme: siteThemeSchema,
    defaultLocale: z.enum(["zh", "en"]),
    enabledThemes: z.array(siteThemeSchema).min(1).max(5),
    accent: hexColorSchema,
    accent2: hexColorSchema,
  })
  .strict()
  .superRefine((appearance, context) => {
    if (!appearance.enabledThemes.includes(appearance.theme)) {
      context.addIssue({
        code: "custom",
        path: ["enabledThemes"],
        message: "default theme must be included in enabledThemes",
      });
    }
    if (new Set(appearance.enabledThemes).size !== appearance.enabledThemes.length) {
      context.addIssue({
        code: "custom",
        path: ["enabledThemes"],
        message: "enabledThemes must be unique",
      });
    }
  });

export const portfolioPackSocialLinkSchema = z
  .object({
    platform: z.string().min(1).max(60),
    label: z.string().min(1).max(120),
    url: safePublicLinkSchema,
    sortOrder: z.number().int(),
    visible: z.boolean(),
  })
  .strict();

export const portfolioPackFocusAreaSchema = z
  .object({
    title: z.string().min(1).max(120),
    titleEn: z.string().max(120),
    description: z.string().max(2000),
    descriptionEn: z.string().max(2000),
    tags: z.array(shortListItemSchema).max(40),
    sortOrder: z.number().int(),
    visible: z.boolean(),
  })
  .strict();

export const portfolioPackExperienceSchema = z
  .object({
    type: z.enum(["work", "education", "project", "competition", "other"]),
    organization: z.string().min(1).max(200),
    organizationEn: z.string().max(200),
    role: z.string().max(200),
    roleEn: z.string().max(200),
    startDate: z.string().max(40),
    endDate: z.string().max(40),
    description: z.string().max(5000),
    descriptionEn: z.string().max(5000),
    skills: z.array(shortListItemSchema).max(40),
    sortOrder: z.number().int(),
    visible: z.boolean(),
  })
  .strict();

export const portfolioPackProjectMetricSchema = z
  .object({
    label: z.string().min(1).max(120),
    value: z.string().min(1).max(120),
    context: z.string().max(500),
    labelEn: z.string().max(120),
    valueEn: z.string().max(120),
    contextEn: z.string().max(500),
  })
  .strict();

export const portfolioPackProjectDecisionSchema = z
  .object({
    title: z.string().min(1).max(160),
    tradeoff: z.string().min(1).max(1200),
    titleEn: z.string().max(160),
    tradeoffEn: z.string().max(1200),
  })
  .strict();

export const portfolioPackProjectGalleryItemSchema = z
  .object({
    src: safeImageUrlSchema.refine((value) => value.trim().length > 0, "image URL required"),
    alt: z.string().min(1).max(300),
    caption: z.string().max(500),
    altEn: z.string().max(300),
    captionEn: z.string().max(500),
  })
  .strict();

export const portfolioPackProjectSchema = z
  .object({
    name: z.string().min(1).max(200),
    nameEn: z.string().max(200),
    slug: slugSchema,
    summary: z.string().max(500),
    summaryEn: z.string().max(500),
    description: z.string().max(12000),
    descriptionEn: z.string().max(12000),
    contentFormat: contentFormatSchema,
    coverUrl: safeImageUrlSchema,
    repositoryUrl: safeHttpUrlSchema,
    demoUrl: safeHttpUrlSchema,
    techStack: z.array(shortListItemSchema).max(40),
    role: z.string().max(200),
    roleEn: z.string().max(200),
    teamSize: z.number().int().min(0).max(10_000),
    duration: z.string().max(120),
    durationEn: z.string().max(120),
    metrics: z.array(portfolioPackProjectMetricSchema).max(20),
    decisions: z.array(portfolioPackProjectDecisionSchema).max(20),
    gallery: z.array(portfolioPackProjectGalleryItemSchema).max(30),
    featured: z.boolean(),
    sortOrder: z.number().int(),
    status: publicationStatusSchema,
  })
  .strict();

export const portfolioPackPostSchema = z
  .object({
    title: z.string().min(1).max(200),
    titleEn: z.string().max(200),
    slug: slugSchema,
    excerpt: z.string().max(500),
    excerptEn: z.string().max(500),
    contentMarkdown: z.string().max(100_000),
    contentEn: z.string().max(100_000),
    contentFormat: contentFormatSchema,
    coverUrl: safeImageUrlSchema,
    category: z.string().max(80),
    tags: z.array(z.string().max(40).refine((value) => value.trim().length > 0)).max(24),
    status: publicationStatusSchema,
    publishedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema,
    seoTitle: z.string().max(200),
    seoDescription: z.string().max(400),
  })
  .strict();

export const portfolioPackKnowledgeBaseSchema = z
  .object({
    name: z.string().min(1).max(120),
    nameEn: z.string().max(120),
    slug: slugSchema,
    description: z.string().max(1000),
    descriptionEn: z.string().max(1000),
    welcomeMessage: z.string().max(2000),
    welcomeMessageEn: z.string().max(2000),
    suggestedQuestions: z
      .array(z.string().max(200).refine((value) => value.trim().length > 0))
      .max(20),
    suggestedQuestionsEn: z
      .array(z.string().max(200).refine((value) => value.trim().length > 0))
      .max(20),
    sortOrder: z.number().int(),
  })
  .strict();

export const portfolioPackSectionsSchema = z
  .object({
    profile: portfolioPackProfileSchema,
    appearance: portfolioPackAppearanceSchema,
    socialLinks: z.array(portfolioPackSocialLinkSchema).max(50),
    focusAreas: z.array(portfolioPackFocusAreaSchema).max(50),
    experiences: z.array(portfolioPackExperienceSchema).max(100),
    projects: z.array(portfolioPackProjectSchema).max(100),
    posts: z.array(portfolioPackPostSchema).max(200),
    knowledgeBases: z.array(portfolioPackKnowledgeBaseSchema).max(50),
  })
  .strict();

function addDuplicateSlugIssues(
  items: ReadonlyArray<{ slug: string }>,
  section: "projects" | "posts" | "knowledgeBases",
  context: z.RefinementCtx,
): void {
  const firstIndex = new Map<string, number>();
  items.forEach((item, index) => {
    const previous = firstIndex.get(item.slug);
    if (previous === undefined) {
      firstIndex.set(item.slug, index);
      return;
    }
    context.addIssue({
      code: "custom",
      path: ["sections", section, index, "slug"],
      message: `duplicate slug; first used at index ${previous}`,
    });
  });
}

function bodyImageReferenceCount(value: string): number {
  let count = 0;
  const markdown = /!\[[^\]]{0,500}\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/gi;
  const html = /<img\b[^>]{0,2000}\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of value.matchAll(markdown)) {
    if (match[1]?.startsWith("/uploads/") || /^https?:\/\//i.test(match[1] ?? "")) count += 1;
  }
  for (const match of value.matchAll(html)) {
    const url = match[1] ?? match[2] ?? match[3] ?? "";
    if (url.startsWith("/uploads/") || /^https?:\/\//i.test(url)) count += 1;
  }
  return count;
}

function mediaReferenceCount(sections: z.infer<typeof portfolioPackSectionsSchema>): number {
  let count = sections.profile.avatarUrl ? 1 : 0;
  for (const project of sections.projects) {
    if (project.coverUrl) count += 1;
    count += project.gallery.length;
    count += bodyImageReferenceCount(project.description);
    count += bodyImageReferenceCount(project.descriptionEn);
  }
  for (const post of sections.posts) {
    if (post.coverUrl) count += 1;
    count += bodyImageReferenceCount(post.contentMarkdown);
    count += bodyImageReferenceCount(post.contentEn);
  }
  return count;
}

export const portfolioPackV1Schema: z.ZodType<PortfolioPackV1> = z
  .object({
    version: z.literal(PORTFOLIO_PACK_VERSION),
    exportedAt: isoDateTimeSchema,
    sections: portfolioPackSectionsSchema,
  })
  .strict()
  .superRefine((pack, context) => {
    const { sections } = pack;
    const entityCount =
      2 +
      sections.socialLinks.length +
      sections.focusAreas.length +
      sections.experiences.length +
      sections.projects.length +
      sections.posts.length +
      sections.knowledgeBases.length;
    if (entityCount > PORTFOLIO_PACK_MAX_ENTITIES) {
      context.addIssue({
        code: "too_big",
        origin: "array",
        maximum: PORTFOLIO_PACK_MAX_ENTITIES,
        inclusive: true,
        path: ["sections"],
        message: `pack exceeds ${PORTFOLIO_PACK_MAX_ENTITIES} total entities`,
      });
    }
    addDuplicateSlugIssues(sections.projects, "projects", context);
    addDuplicateSlugIssues(sections.posts, "posts", context);
    addDuplicateSlugIssues(sections.knowledgeBases, "knowledgeBases", context);
    const referenceCount = mediaReferenceCount(sections);
    if (referenceCount > PORTFOLIO_PACK_MAX_MEDIA_REFERENCES) {
      context.addIssue({
        code: "too_big",
        origin: "array",
        maximum: PORTFOLIO_PACK_MAX_MEDIA_REFERENCES,
        inclusive: true,
        path: ["sections"],
        message: `pack exceeds ${PORTFOLIO_PACK_MAX_MEDIA_REFERENCES} media references`,
      });
    }
  });

export function parsePortfolioPack(input: unknown): PortfolioPackV1 {
  return portfolioPackV1Schema.parse(input);
}

export function safeParsePortfolioPack(input: unknown) {
  return portfolioPackV1Schema.safeParse(input);
}

export function normalizePortfolioPackSelection(input: unknown) {
  const parsed = portfolioPackSelectionSchema.parse(input);
  return PORTFOLIO_PACK_SECTIONS.filter((section) => parsed.includes(section));
}
