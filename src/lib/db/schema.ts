import { customType, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  normalizeProjectDecisions,
  normalizeProjectGallery,
  normalizeProjectMetrics,
} from "@/lib/validators";

function safeJsonArrayColumn<T>(normalize: (value: unknown) => T[]) {
  return customType<{ data: T[]; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value) {
      return JSON.stringify(normalize(value));
    },
    fromDriver(value) {
      try {
        return normalize(JSON.parse(value));
      } catch {
        return [];
      }
    },
  });
}

export const siteProfiles = sqliteTable("site_profiles", {
  id: text("id").primaryKey(),
  siteName: text("site_name").notNull().default("IsMe"),
  displayName: text("display_name").notNull().default(""),
  englishName: text("english_name").notNull().default(""),
  role: text("role").notNull().default(""),
  roleEn: text("role_en").notNull().default(""),
  headline: text("headline").notNull().default(""),
  headlineEn: text("headline_en").notNull().default(""),
  introduction: text("introduction").notNull().default(""),
  introductionEn: text("introduction_en").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  location: text("location").notNull().default(""),
  publicEmail: text("public_email").notNull().default(""),
  availability: text("availability").notNull().default(""),
  availabilityEn: text("availability_en").notNull().default(""),
  theme: text("theme").notNull().default("terminal"), // terminal | ocean | day | ember | slate
  defaultLocale: text("default_locale").notNull().default("zh"), // zh | en
  /** JSON: { enabledThemes, accent, accent2 } */
  themeConfig: text("theme_config", { mode: "json" })
    .$type<{
      enabledThemes?: string[];
      accent?: string;
      accent2?: string;
    }>()
    .notNull()
    .default({}),
  /** Optional bcrypt/scrypt hash; empty = use ADMIN_PASSWORD env. */
  adminPasswordHash: text("admin_password_hash").notNull().default(""),
  /** Monotonic credential generation embedded in every admin session. */
  adminSessionVersion: integer("admin_session_version").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const socialLinks = sqliteTable("social_links", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
});

export const focusAreas = sqliteTable("focus_areas", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  description: text("description").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
});

export const experiences = sqliteTable("experiences", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // work | education | project | competition | other
  organization: text("organization").notNull(),
  organizationEn: text("organization_en").notNull().default(""),
  role: text("role").notNull().default(""),
  roleEn: text("role_en").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  description: text("description").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
});

export type ProjectMetric = {
  label: string;
  value: string;
  context: string;
  labelEn?: string;
  valueEn?: string;
  contextEn?: string;
};

export type ProjectDecision = {
  title: string;
  tradeoff: string;
  titleEn?: string;
  tradeoffEn?: string;
};

export type ProjectGalleryItem = {
  src: string;
  alt: string;
  caption: string;
  altEn?: string;
  captionEn?: string;
};

const projectMetricsJson = safeJsonArrayColumn<ProjectMetric>(normalizeProjectMetrics);
const projectDecisionsJson = safeJsonArrayColumn<ProjectDecision>(normalizeProjectDecisions);
const projectGalleryJson = safeJsonArrayColumn<ProjectGalleryItem>(normalizeProjectGallery);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  slug: text("slug").notNull().unique(),
  summary: text("summary").notNull().default(""),
  summaryEn: text("summary_en").notNull().default(""),
  description: text("description").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  contentFormat: text("content_format").notNull().default("markdown"), // markdown | html
  coverUrl: text("cover_url").notNull().default(""),
  repositoryUrl: text("repository_url").notNull().default(""),
  demoUrl: text("demo_url").notNull().default(""),
  techStack: text("tech_stack", { mode: "json" }).$type<string[]>().notNull().default([]),
  role: text("role").notNull().default(""),
  roleEn: text("role_en").notNull().default(""),
  teamSize: integer("team_size").notNull().default(0),
  duration: text("duration").notNull().default(""),
  durationEn: text("duration_en").notNull().default(""),
  metrics: projectMetricsJson("metrics").notNull().default([]),
  decisions: projectDecisionsJson("decisions").notNull().default([]),
  gallery: projectGalleryJson("gallery").notNull().default([]),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | published | archived
});

export const blogPosts = sqliteTable("blog_posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull().default(""),
  excerptEn: text("excerpt_en").notNull().default(""),
  contentMarkdown: text("content_markdown").notNull().default(""),
  contentEn: text("content_en").notNull().default(""),
  contentFormat: text("content_format").notNull().default("markdown"), // markdown | html
  coverUrl: text("cover_url").notNull().default(""),
  category: text("category").notNull().default(""),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("draft"),
  publishedAt: text("published_at"),
  seoTitle: text("seo_title").notNull().default(""),
  seoDescription: text("seo_description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const contactMessages = sqliteTable("contact_messages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull(),
  status: text("status").notNull().default("unread"), // unread | read | archived
  ipHash: text("ip_hash").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const knowledgeBaseModules = sqliteTable("knowledge_base_modules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  cogdocKbId: text("cogdoc_kb_id").notNull().default(""),
  welcomeMessage: text("welcome_message").notNull().default(""),
  welcomeMessageEn: text("welcome_message_en").notNull().default(""),
  suggestedQuestions: text("suggested_questions", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  suggestedQuestionsEn: text("suggested_questions_en", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  lastContentSyncAt: text("last_content_sync_at").notNull().default(""),
  lastContentSyncSummary: text("last_content_sync_summary").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatEvents = sqliteTable("chat_events", {
  id: text("id").primaryKey(),
  moduleSlug: text("module_slug").notNull(),
  query: text("query").notNull(),
  queryNormalized: text("query_normalized").notNull(),
  sessionId: text("session_id"),
  traceId: text("trace_id").notNull().default(""),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const answerFeedback = sqliteTable("answer_feedback", {
  id: text("id").primaryKey(),
  moduleSlug: text("module_slug").notNull(),
  traceId: text("trace_id").notNull(),
  feedback: text("feedback").notNull(), // thumbs_up | thumbs_down
  comment: text("comment").notNull().default(""),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  target: text("target").notNull().default(""),
  detail: text("detail").notNull().default(""),
  ip: text("ip").notNull().default("unknown"),
  ok: integer("ok", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const pageViews = sqliteTable("page_views", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  referrer: text("referrer").notNull().default(""),
  locale: text("locale").notNull().default(""),
  visitorHash: text("visitor_hash").notNull().default(""),
  device: text("device").notNull().default(""), // mobile | tablet | desktop | bot | unknown
  country: text("country").notNull().default(""), // ISO-3166-1 alpha-2 when CDN provides it
  createdAt: text("created_at").notNull(),
});

export const guestbookMessages = sqliteTable("guestbook_messages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  ipHash: text("ip_hash").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  url: text("url").notNull(),
  bytes: integer("bytes").notNull().default(0),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  storage: text("storage").notNull().default("local"), // local | s3
  createdAt: text("created_at").notNull(),
});

type StoredSiteProfile = typeof siteProfiles.$inferSelect;
/** Content consumers may omit the auth-only generation from fixtures and projections. */
export type SiteProfile = Omit<StoredSiteProfile, "adminSessionVersion"> & {
  adminSessionVersion?: number;
};
export type SocialLink = typeof socialLinks.$inferSelect;
export type FocusArea = typeof focusAreas.$inferSelect;
export type Experience = typeof experiences.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type KnowledgeBaseModule = typeof knowledgeBaseModules.$inferSelect;
export type ChatEvent = typeof chatEvents.$inferSelect;
export type AnswerFeedback = typeof answerFeedback.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type PageView = typeof pageViews.$inferSelect;
export type GuestbookMessage = typeof guestbookMessages.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
