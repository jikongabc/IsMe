import type { ReadinessCounts, ReadinessEnvironment, ReadinessInput } from "@/lib/readiness/types";

export const PORTFOLIO_PACK_VERSION = "portfolio-pack.v1" as const;

export const PORTFOLIO_PACK_SECTIONS = [
  "profile",
  "appearance",
  "socialLinks",
  "focusAreas",
  "experiences",
  "projects",
  "posts",
  "knowledgeBases",
] as const;

export type PortfolioPackSection = (typeof PORTFOLIO_PACK_SECTIONS)[number];

export type PortfolioPackProfile = {
  siteName: string;
  displayName: string;
  englishName: string;
  role: string;
  roleEn: string;
  headline: string;
  headlineEn: string;
  introduction: string;
  introductionEn: string;
  avatarUrl: string;
  location: string;
  publicEmail: string;
  availability: string;
  availabilityEn: string;
};

export type PortfolioPackAppearance = {
  theme: "terminal" | "ocean" | "day" | "ember" | "slate";
  defaultLocale: "zh" | "en";
  enabledThemes: Array<"terminal" | "ocean" | "day" | "ember" | "slate">;
  accent: string;
  accent2: string;
};

export type PortfolioPackSocialLink = {
  platform: string;
  label: string;
  url: string;
  sortOrder: number;
  visible: boolean;
};

export type PortfolioPackFocusArea = {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  tags: string[];
  sortOrder: number;
  visible: boolean;
};

export type PortfolioPackExperience = {
  type: "work" | "education" | "project" | "competition" | "other";
  organization: string;
  organizationEn: string;
  role: string;
  roleEn: string;
  startDate: string;
  endDate: string;
  description: string;
  descriptionEn: string;
  skills: string[];
  sortOrder: number;
  visible: boolean;
};

export type PortfolioPackProjectMetric = {
  label: string;
  value: string;
  context: string;
  labelEn: string;
  valueEn: string;
  contextEn: string;
};

export type PortfolioPackProjectDecision = {
  title: string;
  tradeoff: string;
  titleEn: string;
  tradeoffEn: string;
};

export type PortfolioPackProjectGalleryItem = {
  src: string;
  alt: string;
  caption: string;
  altEn: string;
  captionEn: string;
};

export type PortfolioPackProject = {
  name: string;
  nameEn: string;
  slug: string;
  summary: string;
  summaryEn: string;
  description: string;
  descriptionEn: string;
  contentFormat: "markdown" | "html";
  coverUrl: string;
  repositoryUrl: string;
  demoUrl: string;
  techStack: string[];
  role: string;
  roleEn: string;
  teamSize: number;
  duration: string;
  durationEn: string;
  metrics: PortfolioPackProjectMetric[];
  decisions: PortfolioPackProjectDecision[];
  gallery: PortfolioPackProjectGalleryItem[];
  featured: boolean;
  sortOrder: number;
  status: "draft" | "published" | "archived";
};

export type PortfolioPackPost = {
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  excerptEn: string;
  contentMarkdown: string;
  contentEn: string;
  contentFormat: "markdown" | "html";
  coverUrl: string;
  category: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  updatedAt: string;
  seoTitle: string;
  seoDescription: string;
};

/** Portable knowledge content only. CogDoc binding, enabled state, and sync metadata never enter a pack. */
export type PortfolioPackKnowledgeBase = {
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

export type PortfolioPackSections = {
  profile: PortfolioPackProfile;
  appearance: PortfolioPackAppearance;
  socialLinks: PortfolioPackSocialLink[];
  focusAreas: PortfolioPackFocusArea[];
  experiences: PortfolioPackExperience[];
  projects: PortfolioPackProject[];
  posts: PortfolioPackPost[];
  knowledgeBases: PortfolioPackKnowledgeBase[];
};

export type PortfolioPackV1 = {
  version: typeof PORTFOLIO_PACK_VERSION;
  exportedAt: string;
  sections: PortfolioPackSections;
};

export type PortfolioPackIssue = {
  code: string;
  severity: "warning" | "blocker";
  detail: string;
  section?: PortfolioPackSection;
  subject?: string;
};

export type PortfolioPackMediaReference = {
  kind: "local-upload" | "external";
  url: string;
  section: "profile" | "projects" | "posts";
  subject: string;
  field: string;
};

export type PortfolioPackMediaScan = {
  references: PortfolioPackMediaReference[];
  truncated: boolean;
};

export type PortfolioPackPublicationAdjustment = {
  action: "demote-to-draft" | "assign-published-at";
  section: "projects" | "posts";
  slug: string;
  label: string;
  from: "published";
  to: "draft" | "published";
  reasons: string[];
};

export type PortfolioPackChange = {
  action: "add" | "replace" | "remove";
  key: string;
  label: string;
  /** Singleton sections use this to name changed public fields. */
  fields?: string[];
  /** Short public values only; never database identifiers or credentials. */
  from?: string;
  to?: string;
};

export type PortfolioPackSectionPlan = {
  section: PortfolioPackSection;
  current: number;
  incoming: number;
  added: number;
  replaced: number;
  removed: number;
  changes: PortfolioPackChange[];
  changesTruncated: boolean;
  selected: boolean;
  recommended: boolean;
};

export type PortfolioPackReadinessSummary = {
  score: number;
  readyToShare: boolean;
  counts: ReadinessCounts;
};

export type PortfolioPackPlan = {
  version: typeof PORTFOLIO_PACK_VERSION;
  sections: PortfolioPackSectionPlan[];
  warnings: PortfolioPackIssue[];
  blockers: PortfolioPackIssue[];
  mediaReferences: PortfolioPackMediaReference[];
  mediaReferencesTruncated: boolean;
  publicationAdjustments: PortfolioPackPublicationAdjustment[];
  recommendedSelection: PortfolioPackSection[];
  selectedSections: PortfolioPackSection[];
  readiness?: {
    before: PortfolioPackReadinessSummary;
    projected: PortfolioPackReadinessSummary;
  };
};

export type PortfolioPackPreviewPlan = PortfolioPackPlan & {
  /** Server-generated SHA-256 interlock over current selected state, incoming data, and selection. */
  fingerprint: string;
};

export type PortfolioPackApplyResult = {
  version: typeof PORTFOLIO_PACK_VERSION;
  appliedAt: string;
  fingerprint: string;
  selectedSections: PortfolioPackSection[];
  sections: PortfolioPackSectionPlan[];
  warnings: PortfolioPackIssue[];
  publicationAdjustments: PortfolioPackPublicationAdjustment[];
  readiness?: PortfolioPackReadinessSummary;
};

export type PortfolioSetupSnapshot = {
  counts: Record<PortfolioPackSection, number>;
  demoExactMatchCounts: Record<PortfolioPackSection, number>;
  hasPlaceholders: boolean;
  hasRealContent: boolean;
  defaultLocale: "zh" | "en";
  recommendedSelection: PortfolioPackSection[];
  mediaWarningCounts: {
    localUploads: number;
    external: number;
    total: number;
    truncated: boolean;
  };
  beforeReadiness: PortfolioPackReadinessSummary;
};

export type PortfolioPackPlanInput = {
  current: PortfolioPackV1;
  incoming: PortfolioPackV1;
  selection?: readonly PortfolioPackSection[];
  readinessInput?: ReadinessInput;
  /** Opaque server-only digest for local state intentionally excluded from the portable DTO. */
  interlockSalt?: string;
};

export type PortfolioPackProjectionInput = {
  current: ReadinessInput;
  incoming: PortfolioPackV1;
  selection: readonly PortfolioPackSection[];
};

export type PortfolioPackReadinessEnvironment = ReadinessEnvironment;
