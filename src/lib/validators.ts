import { z } from "zod";
import { adminPasswordPolicyIssues } from "@/lib/auth/credential-policy";

/** Empty, same-origin path, or http(s) URL — rejects javascript: and other schemes. */
export function isSafeHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v.startsWith("/")) {
    if (v.startsWith("//") || v.includes("\\") || v.includes("..")) return false;
    return /^\/[\w./\-?&=%#~+:,@]*$/i.test(v);
  }
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const safeHttpUrl = z
  .string()
  .max(500)
  .refine(isSafeHttpUrl, { message: "must be http(s) URL or site-relative path" });

/** Empty, same-origin path, or HTTPS URL — aligned with the public img-src CSP. */
export function isSafeImageUrl(value: string): boolean {
  const v = value.trim();
  if (!v || v.startsWith("/")) return isSafeHttpUrl(v);
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

const safeImageUrl = z
  .string()
  .max(500)
  .refine(isSafeImageUrl, { message: "must be an HTTPS URL or site-relative path" });

/** Public profile links may additionally use a simple mailto: address. */
export function isSafePublicLink(value: string): boolean {
  if (isSafeHttpUrl(value)) return true;
  const v = value.trim();
  if (!v || /[\r\n]/.test(v)) return false;
  try {
    const url = new URL(v);
    return (
      url.protocol === "mailto:" &&
      !url.search &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const safePublicLink = z
  .string()
  .max(500)
  .refine(isSafePublicLink, {
    message: "must be an http(s), mailto, or site-relative URL",
  });

const contentFormatEnum = z.enum(["markdown", "html"]).default("markdown");

const projectEvidenceText = z.string().max(500);

export const projectMetricSchema = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(120),
  context: projectEvidenceText.default(""),
  labelEn: z.string().max(120).optional().default(""),
  valueEn: z.string().max(120).optional().default(""),
  contextEn: projectEvidenceText.optional().default(""),
});

export const projectDecisionSchema = z.object({
  title: z.string().min(1).max(160),
  tradeoff: z.string().min(1).max(1200),
  titleEn: z.string().max(160).optional().default(""),
  tradeoffEn: z.string().max(1200).optional().default(""),
});

export const projectGalleryItemSchema = z.object({
  src: safeImageUrl.refine((value) => value.trim().length > 0, {
    message: "image URL required",
  }),
  alt: z.string().min(1).max(300),
  caption: z.string().max(500).default(""),
  altEn: z.string().max(300).optional().default(""),
  captionEn: z.string().max(500).optional().default(""),
});

function normalizeEvidenceArray<T>(
  value: unknown,
  parse: (item: unknown) => { success: true; data: T } | { success: false },
): T[] {
  if (!Array.isArray(value)) return [];
  const normalized: T[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result.success) normalized.push(result.data);
  }
  return normalized;
}

/** Defensive read normalizers for rows that may predate API validation. */
export function normalizeProjectMetrics(value: unknown) {
  return normalizeEvidenceArray(value, (item) => projectMetricSchema.safeParse(item));
}

export function normalizeProjectDecisions(value: unknown) {
  return normalizeEvidenceArray(value, (item) => projectDecisionSchema.safeParse(item));
}

export function normalizeProjectGallery(value: unknown) {
  return normalizeEvidenceArray(value, (item) => projectGalleryItemSchema.safeParse(item));
}

export const projectIdSchema = z.string().min(1).max(100);

export const profileSchema = z.object({
  siteName: z.string().min(1).max(120),
  displayName: z.string().max(120),
  englishName: z.string().max(120),
  role: z.string().max(200),
  roleEn: z.string().max(200).optional().default(""),
  headline: z.string().max(400),
  headlineEn: z.string().max(400).optional().default(""),
  introduction: z.string().max(8000),
  introductionEn: z.string().max(8000).optional().default(""),
  avatarUrl: safeImageUrl,
  location: z.string().max(120),
  publicEmail: z.string().max(200),
  availability: z.string().max(200),
  availabilityEn: z.string().max(200).optional().default(""),
});

export const experienceSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["work", "education", "project", "competition", "other"]),
  organization: z.string().min(1).max(200),
  organizationEn: z.string().max(200).optional().default(""),
  role: z.string().max(200),
  roleEn: z.string().max(200).optional().default(""),
  startDate: z.string().max(40),
  endDate: z.string().max(40),
  description: z.string().max(5000),
  descriptionEn: z.string().max(5000).optional().default(""),
  skills: z.array(z.string().max(60)).max(40).default([]),
  sortOrder: z.coerce.number().int().default(0),
  visible: z.boolean().default(true),
});

export const projectSchema = z.object({
  id: projectIdSchema.optional(),
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().default(""),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  summary: z.string().max(500),
  summaryEn: z.string().max(500).optional().default(""),
  description: z.string().max(12000),
  descriptionEn: z.string().max(12000).optional().default(""),
  contentFormat: contentFormatEnum,
  coverUrl: safeImageUrl,
  repositoryUrl: safeHttpUrl,
  demoUrl: safeHttpUrl,
  techStack: z.array(z.string().max(60)).max(40).default([]),
  role: z.string().max(200).optional().default(""),
  roleEn: z.string().max(200).optional().default(""),
  teamSize: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  duration: z.string().max(120).optional().default(""),
  durationEn: z.string().max(120).optional().default(""),
  metrics: z.array(projectMetricSchema).max(20).optional().default([]),
  decisions: z.array(projectDecisionSchema).max(20).optional().default([]),
  gallery: z.array(projectGalleryItemSchema).max(30).optional().default([]),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const knowledgeBaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional().default(""),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  description: z.string().max(1000),
  descriptionEn: z.string().max(1000).optional().default(""),
  cogdocKbId: z.string().max(200),
  welcomeMessage: z.string().max(2000),
  welcomeMessageEn: z.string().max(2000).optional().default(""),
  suggestedQuestions: z.array(z.string().max(200)).max(20).default([]),
  suggestedQuestionsEn: z.array(z.string().max(200)).max(20).optional().default([]),
  enabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const chatRequestSchema = z.object({
  moduleSlug: z.string().min(1).max(120),
  query: z.string().min(1).max(2000),
  sessionId: z.string().max(200).nullable().optional(),
  mode: z.enum(["auto", "qa", "summary", "compare"]).optional().default("auto"),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

export const socialLinkSchema = z.object({
  id: z.string().optional(),
  platform: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  url: safePublicLink.refine((v) => v.trim().length > 0, { message: "url required" }),
  sortOrder: z.coerce.number().int().default(0),
  visible: z.boolean().default(true),
});

export const focusAreaSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(120),
  titleEn: z.string().max(120).optional().default(""),
  description: z.string().max(2000),
  descriptionEn: z.string().max(2000).optional().default(""),
  tags: z.array(z.string().max(60)).max(40).default([]),
  sortOrder: z.coerce.number().int().default(0),
  visible: z.boolean().default(true),
});

export const blogPostSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  titleEn: z.string().max(200).optional().default(""),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  excerpt: z.string().max(500),
  excerptEn: z.string().max(500).optional().default(""),
  contentMarkdown: z.string().max(100_000),
  contentEn: z.string().max(100_000).optional().default(""),
  contentFormat: contentFormatEnum,
  coverUrl: safeImageUrl,
  category: z.string().max(80),
  tags: z.array(z.string().max(40)).max(24).default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  seoTitle: z.string().max(200),
  seoDescription: z.string().max(400),
});

export const contactSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(200),
  body: z.string().min(2).max(5000),
  /** Honeypot — must stay empty. */
  company: z.string().max(200).optional().default(""),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
  confirmPassword: z.string().min(1).max(200),
}).superRefine((data, ctx) => {
  for (const issue of adminPasswordPolicyIssues(data.newPassword)) {
    ctx.addIssue({
      code: "custom",
      path: ["newPassword"],
      message: issue.message,
    });
  }
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "passwords do not match",
    });
  }
});

const siteThemeEnum = z.enum(["terminal", "ocean", "day", "ember", "slate"]);

const optionalHex = z
  .string()
  .max(16)
  .refine((v) => !v.trim() || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()), {
    message: "must be #RGB or #RRGGBB",
  })
  .transform((v) => v.trim().toLowerCase());

export const appearanceSchema = z
  .object({
    theme: siteThemeEnum,
    defaultLocale: z.enum(["zh", "en"]).default("zh"),
    enabledThemes: z.array(siteThemeEnum).min(1).max(5).default([
      "terminal",
      "ocean",
      "day",
      "ember",
      "slate",
    ]),
    accent: optionalHex.optional().default(""),
    accent2: optionalHex.optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.enabledThemes.includes(data.theme)) {
      ctx.addIssue({
        code: "custom",
        path: ["enabledThemes"],
        message: "default theme must be included in enabledThemes",
      });
    }
  });

export const localeSchema = z.object({
  locale: z.enum(["zh", "en"]),
});

export const visitorThemeSchema = z.object({
  theme: siteThemeEnum,
});

export const pageViewSchema = z.object({
  path: z.string().min(1).max(300),
  referrer: z.string().max(500).optional(),
  locale: z.string().max(16).optional(),
});

export const guestbookSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().max(200).optional().default(""),
  body: z.string().min(2).max(2000),
  /** Honeypot — must stay empty. */
  website: z.string().max(200).optional().default(""),
});
