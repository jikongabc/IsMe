import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  blogPosts,
  experiences,
  focusAreas,
  knowledgeBaseModules,
  projects,
  siteProfiles,
  socialLinks,
  type Experience,
  type FocusArea,
  type KnowledgeBaseModule,
  type Project,
  type SiteProfile,
  type SocialLink,
} from "@/lib/db/schema";
import { rankRelatedPosts } from "@/lib/content/related-posts";
import {
  coerceThemeConfig,
  normalizeTheme,
  parseThemeConfig,
  type SiteTheme,
  type ThemeConfig,
} from "@/lib/theme";

export async function getSiteTheme(): Promise<SiteTheme> {
  const profile = getDb().select().from(siteProfiles).limit(1).all()[0];
  return normalizeTheme(profile?.theme);
}

export async function getSiteAppearance(): Promise<{
  theme: SiteTheme;
  defaultLocale: "zh" | "en";
  themeConfig: ThemeConfig;
}> {
  const profile = getDb().select().from(siteProfiles).limit(1).all()[0];
  const locale = profile?.defaultLocale === "en" ? "en" : "zh";
  const theme = normalizeTheme(profile?.theme);
  const themeConfig = coerceThemeConfig(parseThemeConfig(profile?.themeConfig), theme);
  return {
    theme,
    defaultLocale: locale,
    themeConfig,
  };
}

export type PublicSiteBundle = {
  profile: SiteProfile | null;
  socialLinks: SocialLink[];
  focusAreas: FocusArea[];
  experiences: Experience[];
  featuredProjects: Project[];
  projects: Project[];
  knowledgeBases: PublicKnowledgeBase[];
};

export type PublicKnowledgeBase = {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  descriptionEn: string;
  welcomeMessage: string;
  welcomeMessageEn: string;
  suggestedQuestions: string[];
  suggestedQuestionsEn: string[];
  sortOrder: number;
};

function toPublicKb(row: KnowledgeBaseModule): PublicKnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.nameEn ?? "",
    slug: row.slug,
    description: row.description,
    descriptionEn: row.descriptionEn ?? "",
    welcomeMessage: row.welcomeMessage,
    welcomeMessageEn: row.welcomeMessageEn ?? "",
    suggestedQuestions: row.suggestedQuestions ?? [],
    suggestedQuestionsEn: row.suggestedQuestionsEn ?? [],
    sortOrder: row.sortOrder,
  };
}

export async function getPublicSiteBundle(): Promise<PublicSiteBundle> {
  const db = getDb();

  const profile = db.select().from(siteProfiles).limit(1).all()[0] ?? null;
  const links = db
    .select()
    .from(socialLinks)
    .where(eq(socialLinks.visible, true))
    .orderBy(asc(socialLinks.sortOrder))
    .all();
  const areas = db
    .select()
    .from(focusAreas)
    .where(eq(focusAreas.visible, true))
    .orderBy(asc(focusAreas.sortOrder))
    .all();
  const exps = db
    .select()
    .from(experiences)
    .where(eq(experiences.visible, true))
    .orderBy(asc(experiences.sortOrder))
    .all();
  const publishedProjects = db
    .select()
    .from(projects)
    .where(eq(projects.status, "published"))
    .orderBy(asc(projects.sortOrder))
    .all();
  const kbs = db
    .select()
    .from(knowledgeBaseModules)
    .where(eq(knowledgeBaseModules.enabled, true))
    .orderBy(asc(knowledgeBaseModules.sortOrder))
    .all()
    .map(toPublicKb);

  return {
    profile,
    socialLinks: links,
    focusAreas: areas,
    experiences: exps,
    featuredProjects: publishedProjects.filter((p) => p.featured),
    projects: publishedProjects,
    knowledgeBases: kbs,
  };
}

export async function getPublishedProjectBySlug(slug: string): Promise<Project | null> {
  const db = getDb();
  return (
    db
      .select()
      .from(projects)
      .where(and(eq(projects.slug, slug), eq(projects.status, "published")))
      .limit(1)
      .all()[0] ?? null
  );
}

export async function getPublicKnowledgeBases(): Promise<PublicKnowledgeBase[]> {
  const db = getDb();
  return db
    .select()
    .from(knowledgeBaseModules)
    .where(eq(knowledgeBaseModules.enabled, true))
    .orderBy(asc(knowledgeBaseModules.sortOrder))
    .all()
    .map(toPublicKb);
}

export async function getEnabledKbBySlug(
  slug: string,
): Promise<KnowledgeBaseModule | null> {
  const db = getDb();
  return (
    db
      .select()
      .from(knowledgeBaseModules)
      .where(and(eq(knowledgeBaseModules.slug, slug), eq(knowledgeBaseModules.enabled, true)))
      .limit(1)
      .all()[0] ?? null
  );
}

export async function getAdminProfile(): Promise<SiteProfile | null> {
  const db = getDb();
  return db.select().from(siteProfiles).limit(1).all()[0] ?? null;
}

export async function listAdminSocialLinks(): Promise<SocialLink[]> {
  return getDb().select().from(socialLinks).orderBy(asc(socialLinks.sortOrder)).all();
}

export async function listAdminFocusAreas(): Promise<FocusArea[]> {
  return getDb().select().from(focusAreas).orderBy(asc(focusAreas.sortOrder)).all();
}

export async function listAdminExperiences(): Promise<Experience[]> {
  return getDb().select().from(experiences).orderBy(asc(experiences.sortOrder)).all();
}

export async function listAdminProjects(): Promise<Project[]> {
  return getDb().select().from(projects).orderBy(asc(projects.sortOrder)).all();
}

export async function listAdminKnowledgeBases(): Promise<KnowledgeBaseModule[]> {
  return getDb()
    .select()
    .from(knowledgeBaseModules)
    .orderBy(asc(knowledgeBaseModules.sortOrder))
    .all();
}

export async function getAdminKnowledgeBaseById(
  id: string,
): Promise<KnowledgeBaseModule | null> {
  return (
    getDb()
      .select()
      .from(knowledgeBaseModules)
      .where(eq(knowledgeBaseModules.id, id))
      .limit(1)
      .all()[0] ?? null
  );
}

export async function listPublishedPosts(options?: {
  tag?: string | null;
  q?: string | null;
}) {
  let posts = getDb()
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt))
    .all();

  const tag = options?.tag?.trim().toLowerCase();
  if (tag) {
    posts = posts.filter((post) =>
      (post.tags ?? []).some((item) => item.toLowerCase() === tag),
    );
  }

  const q = options?.q?.trim().toLowerCase();
  if (q) {
    posts = posts.filter((post) => {
      const hay = [
        post.title,
        post.titleEn,
        post.excerpt,
        post.excerptEn,
        post.contentMarkdown,
        post.contentEn,
        post.category,
        ...(post.tags ?? []),
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return posts;
}

export async function listPublishedPostTags(): Promise<
  Array<{ tag: string; count: number }>
> {
  const posts = await listPublishedPosts();
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      const key = tag.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function getPublishedPostBySlug(slug: string) {
  return (
    getDb()
      .select()
      .from(blogPosts)
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
      .limit(1)
      .all()[0] ?? null
  );
}

/** Related published posts: shared tags first, then same category. */
export async function listRelatedPublishedPosts(
  slug: string,
  limit = 3,
): Promise<
  Array<{
    slug: string;
    title: string;
    titleEn: string;
    excerpt: string;
    excerptEn: string;
    publishedAt: string | null;
  }>
> {
  const current = await getPublishedPostBySlug(slug);
  if (!current) return [];

  const ranked = rankRelatedPosts(current, await listPublishedPosts(), limit);
  return ranked.map((post) => ({
    slug: post.slug,
    title: post.title,
    titleEn: post.titleEn ?? "",
    excerpt: post.excerpt,
    excerptEn: post.excerptEn ?? "",
    publishedAt: post.publishedAt,
  }));
}

export async function listAdminPosts() {
  return getDb().select().from(blogPosts).orderBy(desc(blogPosts.updatedAt)).all();
}
