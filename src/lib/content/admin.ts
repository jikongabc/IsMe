import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  blogPosts,
  experiences,
  focusAreas,
  knowledgeBaseModules,
  projects,
  siteProfiles,
  socialLinks,
} from "@/lib/db/schema";
import {
  DEFAULT_THEME_CONFIG,
  parseThemeConfig,
  type SiteTheme,
} from "@/lib/theme";
import type {
  blogPostSchema,
  experienceSchema,
  focusAreaSchema,
  knowledgeBaseSchema,
  profileSchema,
  projectSchema,
  socialLinkSchema,
} from "@/lib/validators";
import type { z } from "zod";

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function upsertProfile(data: z.infer<typeof profileSchema>) {
  const db = getDb();
  const existing = db.select().from(siteProfiles).limit(1).all()[0];
  const timestamp = now();

  if (existing) {
    db.update(siteProfiles)
      .set({ ...data, updatedAt: timestamp })
      .where(eq(siteProfiles.id, existing.id))
      .run();
    return existing.id;
  }

  const profileId = id("profile");
  db.insert(siteProfiles)
    .values({
      id: profileId,
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return profileId;
}

export function createExperience(data: z.infer<typeof experienceSchema>) {
  const rowId = id("exp");
  getDb()
    .insert(experiences)
    .values({
      id: rowId,
      type: data.type,
      organization: data.organization,
      organizationEn: data.organizationEn ?? "",
      role: data.role,
      roleEn: data.roleEn ?? "",
      startDate: data.startDate,
      endDate: data.endDate,
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      skills: data.skills,
      sortOrder: data.sortOrder,
      visible: data.visible,
    })
    .run();
  return rowId;
}

export function updateExperience(rowId: string, data: z.infer<typeof experienceSchema>) {
  getDb()
    .update(experiences)
    .set({
      type: data.type,
      organization: data.organization,
      organizationEn: data.organizationEn ?? "",
      role: data.role,
      roleEn: data.roleEn ?? "",
      startDate: data.startDate,
      endDate: data.endDate,
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      skills: data.skills,
      sortOrder: data.sortOrder,
      visible: data.visible,
    })
    .where(eq(experiences.id, rowId))
    .run();
}

export function deleteExperience(rowId: string) {
  getDb().delete(experiences).where(eq(experiences.id, rowId)).run();
}

export function createProject(data: z.infer<typeof projectSchema>) {
  const rowId = id("proj");
  getDb()
    .insert(projects)
    .values({
      id: rowId,
      name: data.name,
      nameEn: data.nameEn ?? "",
      slug: data.slug,
      summary: data.summary,
      summaryEn: data.summaryEn ?? "",
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      contentFormat: data.contentFormat ?? "markdown",
      coverUrl: data.coverUrl,
      repositoryUrl: data.repositoryUrl,
      demoUrl: data.demoUrl,
      techStack: data.techStack,
      role: data.role,
      roleEn: data.roleEn,
      teamSize: data.teamSize,
      duration: data.duration,
      durationEn: data.durationEn,
      metrics: data.metrics,
      decisions: data.decisions,
      gallery: data.gallery,
      featured: data.featured,
      sortOrder: data.sortOrder,
      status: data.status,
    })
    .run();
  return rowId;
}

export function updateProject(rowId: string, data: z.infer<typeof projectSchema>) {
  const result = getDb()
    .update(projects)
    .set({
      name: data.name,
      nameEn: data.nameEn ?? "",
      slug: data.slug,
      summary: data.summary,
      summaryEn: data.summaryEn ?? "",
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      contentFormat: data.contentFormat ?? "markdown",
      coverUrl: data.coverUrl,
      repositoryUrl: data.repositoryUrl,
      demoUrl: data.demoUrl,
      techStack: data.techStack,
      role: data.role,
      roleEn: data.roleEn,
      teamSize: data.teamSize,
      duration: data.duration,
      durationEn: data.durationEn,
      metrics: data.metrics,
      decisions: data.decisions,
      gallery: data.gallery,
      featured: data.featured,
      sortOrder: data.sortOrder,
      status: data.status,
    })
    .where(eq(projects.id, rowId))
    .run();
  return result.changes > 0;
}

export function deleteProject(rowId: string) {
  return getDb().delete(projects).where(eq(projects.id, rowId)).run().changes > 0;
}

export function createKnowledgeBase(data: z.infer<typeof knowledgeBaseSchema>) {
  const rowId = id("kb");
  const timestamp = now();
  getDb()
    .insert(knowledgeBaseModules)
    .values({
      id: rowId,
      name: data.name,
      nameEn: data.nameEn ?? "",
      slug: data.slug,
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      cogdocKbId: data.cogdocKbId,
      welcomeMessage: data.welcomeMessage,
      welcomeMessageEn: data.welcomeMessageEn ?? "",
      suggestedQuestions: data.suggestedQuestions,
      suggestedQuestionsEn: data.suggestedQuestionsEn ?? [],
      enabled: data.enabled,
      sortOrder: data.sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return rowId;
}

export function updateKnowledgeBase(rowId: string, data: z.infer<typeof knowledgeBaseSchema>) {
  getDb()
    .update(knowledgeBaseModules)
    .set({
      name: data.name,
      nameEn: data.nameEn ?? "",
      slug: data.slug,
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      cogdocKbId: data.cogdocKbId,
      welcomeMessage: data.welcomeMessage,
      welcomeMessageEn: data.welcomeMessageEn ?? "",
      suggestedQuestions: data.suggestedQuestions,
      suggestedQuestionsEn: data.suggestedQuestionsEn ?? [],
      enabled: data.enabled,
      sortOrder: data.sortOrder,
      updatedAt: now(),
    })
    .where(eq(knowledgeBaseModules.id, rowId))
    .run();
}

export function deleteKnowledgeBase(rowId: string) {
  getDb().delete(knowledgeBaseModules).where(eq(knowledgeBaseModules.id, rowId)).run();
}

export function createSocialLink(data: z.infer<typeof socialLinkSchema>) {
  const rowId = id("link");
  getDb()
    .insert(socialLinks)
    .values({
      id: rowId,
      platform: data.platform,
      label: data.label,
      url: data.url,
      sortOrder: data.sortOrder,
      visible: data.visible,
    })
    .run();
  return rowId;
}

export function updateSocialLink(rowId: string, data: z.infer<typeof socialLinkSchema>) {
  getDb()
    .update(socialLinks)
    .set({
      platform: data.platform,
      label: data.label,
      url: data.url,
      sortOrder: data.sortOrder,
      visible: data.visible,
    })
    .where(eq(socialLinks.id, rowId))
    .run();
}

export function deleteSocialLink(rowId: string) {
  getDb().delete(socialLinks).where(eq(socialLinks.id, rowId)).run();
}

export function createFocusArea(data: z.infer<typeof focusAreaSchema>) {
  const rowId = id("focus");
  getDb()
    .insert(focusAreas)
    .values({
      id: rowId,
      title: data.title,
      titleEn: data.titleEn ?? "",
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      tags: data.tags,
      sortOrder: data.sortOrder,
      visible: data.visible,
    })
    .run();
  return rowId;
}

export function updateFocusArea(rowId: string, data: z.infer<typeof focusAreaSchema>) {
  getDb()
    .update(focusAreas)
    .set({
      title: data.title,
      titleEn: data.titleEn ?? "",
      description: data.description,
      descriptionEn: data.descriptionEn ?? "",
      tags: data.tags,
      sortOrder: data.sortOrder,
      visible: data.visible,
    })
    .where(eq(focusAreas.id, rowId))
    .run();
}

export function deleteFocusArea(rowId: string) {
  getDb().delete(focusAreas).where(eq(focusAreas.id, rowId)).run();
}

export function updateSiteAppearance(data: {
  theme: SiteTheme;
  defaultLocale: "zh" | "en";
  enabledThemes: SiteTheme[];
  accent?: string;
  accent2?: string;
}) {
  const db = getDb();
  const existing = db.select().from(siteProfiles).limit(1).all()[0];
  const timestamp = now();
  const themeConfig = {
    enabledThemes: data.enabledThemes,
    accent: data.accent ?? "",
    accent2: data.accent2 ?? "",
  };
  if (!existing) {
    const profileId = id("profile");
    db.insert(siteProfiles)
      .values({
        id: profileId,
        siteName: "IsMe",
        theme: data.theme,
        defaultLocale: data.defaultLocale,
        themeConfig,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return profileId;
  }
  db.update(siteProfiles)
    .set({
      theme: data.theme,
      defaultLocale: data.defaultLocale,
      themeConfig,
      updatedAt: timestamp,
    })
    .where(eq(siteProfiles.id, existing.id))
    .run();
  return existing.id;
}

/** @deprecated use updateSiteAppearance */
export function updateSiteTheme(theme: SiteTheme) {
  const existing = getDb().select().from(siteProfiles).limit(1).all()[0];
  const appearance = existing
    ? parseThemeConfig(existing.themeConfig)
    : DEFAULT_THEME_CONFIG;
  return updateSiteAppearance({
    theme,
    defaultLocale: (existing?.defaultLocale as "zh" | "en") || "zh",
    enabledThemes: appearance.enabledThemes,
    accent: appearance.accent,
    accent2: appearance.accent2,
  });
}

export function createBlogPost(data: z.infer<typeof blogPostSchema>) {
  const rowId = id("post");
  const timestamp = now();
  getDb()
    .insert(blogPosts)
    .values({
      id: rowId,
      title: data.title,
      titleEn: data.titleEn ?? "",
      slug: data.slug,
      excerpt: data.excerpt,
      excerptEn: data.excerptEn ?? "",
      contentMarkdown: data.contentMarkdown,
      contentEn: data.contentEn ?? "",
      contentFormat: data.contentFormat ?? "markdown",
      coverUrl: data.coverUrl,
      category: data.category,
      tags: data.tags,
      status: data.status,
      publishedAt: data.status === "published" ? timestamp : null,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return rowId;
}

export function updateBlogPost(rowId: string, data: z.infer<typeof blogPostSchema>) {
  const db = getDb();
  const existing = db.select().from(blogPosts).where(eq(blogPosts.id, rowId)).limit(1).all()[0];
  const timestamp = now();
  let publishedAt = existing?.publishedAt ?? null;
  if (data.status === "published" && !publishedAt) {
    publishedAt = timestamp;
  }
  if (data.status !== "published") {
    publishedAt = existing?.status === "published" ? existing.publishedAt : null;
  }

  db.update(blogPosts)
    .set({
      title: data.title,
      titleEn: data.titleEn ?? "",
      slug: data.slug,
      excerpt: data.excerpt,
      excerptEn: data.excerptEn ?? "",
      contentMarkdown: data.contentMarkdown,
      contentEn: data.contentEn ?? "",
      contentFormat: data.contentFormat ?? "markdown",
      coverUrl: data.coverUrl,
      category: data.category,
      tags: data.tags,
      status: data.status,
      publishedAt,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      updatedAt: timestamp,
    })
    .where(eq(blogPosts.id, rowId))
    .run();
}

export function deleteBlogPost(rowId: string) {
  getDb().delete(blogPosts).where(eq(blogPosts.id, rowId)).run();
}
