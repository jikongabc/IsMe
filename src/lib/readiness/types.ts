export type ReadinessStatus = "pass" | "warning" | "blocker";

export type ReadinessCategory =
  | "identity"
  | "portfolio"
  | "experience"
  | "content"
  | "deployment"
  | "knowledge"
  | "links";

export type ReadinessAction = {
  label: string;
  href: string;
};

export type ReadinessItem = {
  id: string;
  category: ReadinessCategory;
  status: ReadinessStatus;
  title: string;
  detail: string;
  subject?: string;
  action?: ReadinessAction;
  weight: number;
};

export type ReadinessCounts = {
  pass: number;
  warning: number;
  blocker: number;
};

export type ReadinessLinkCheck = {
  url: string;
  label: string;
  source: string;
  status: "ok" | "failed" | "blocked" | "skipped";
  httpStatus?: number;
  latencyMs?: number;
  detail?: string;
};

export type ReadinessReport = {
  generatedAt: string;
  score: number;
  readyToShare: boolean;
  counts: ReadinessCounts;
  items: ReadinessItem[];
  linkChecks?: ReadinessLinkCheck[];
  /** Total public link targets discovered before the bounded network audit. */
  linkTargetCount?: number;
};

export type ReadinessProfile = {
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
  defaultLocale: string;
};

export type ReadinessSocialLink = {
  id: string;
  platform: string;
  label: string;
  url: string;
  visible: boolean;
};

export type ReadinessFocusArea = {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  tags: string[];
  visible: boolean;
};

export type ReadinessExperience = {
  id: string;
  type: string;
  organization: string;
  organizationEn: string;
  role: string;
  roleEn: string;
  startDate: string;
  endDate: string;
  description: string;
  descriptionEn: string;
  skills: string[];
  visible: boolean;
};

export type ReadinessMetric = {
  label: string;
  value: string;
  context: string;
  labelEn?: string;
  valueEn?: string;
  contextEn?: string;
};

export type ReadinessDecision = {
  title: string;
  tradeoff: string;
  titleEn?: string;
  tradeoffEn?: string;
};

export type ReadinessGalleryItem = {
  src: string;
  alt: string;
  caption: string;
  altEn?: string;
  captionEn?: string;
};

export type ReadinessProject = {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  summary: string;
  summaryEn: string;
  description: string;
  descriptionEn: string;
  contentFormat: string;
  coverUrl: string;
  repositoryUrl: string;
  demoUrl: string;
  techStack: string[];
  role: string;
  roleEn: string;
  teamSize: number;
  duration: string;
  durationEn: string;
  metrics: ReadinessMetric[];
  decisions: ReadinessDecision[];
  gallery: ReadinessGalleryItem[];
  featured: boolean;
  status: string;
};

export type ReadinessPost = {
  id: string;
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  excerptEn: string;
  contentMarkdown: string;
  contentEn: string;
  contentFormat: string;
  coverUrl: string;
  category: string;
  tags: string[];
  status: string;
  seoTitle: string;
  seoDescription: string;
};

export type ReadinessKnowledgeBase = {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  descriptionEn: string;
  cogdocKbId: string;
  welcomeMessage: string;
  welcomeMessageEn: string;
  suggestedQuestions: string[];
  suggestedQuestionsEn: string[];
  enabled: boolean;
};

/**
 * Only public configuration and boolean secret-health summaries cross this
 * boundary. Raw credentials and password hashes must never be added here.
 */
export type ReadinessEnvironment = {
  nodeEnv: string;
  siteUrl: string;
  /** Whether the fallback ADMIN_PASSWORD is safe enough for a production boot. */
  adminEnvironmentReady: boolean;
  /** Whether the password source that currently authenticates admins meets current policy. */
  adminCredentialReady: boolean;
  adminCredentialSource: "environment" | "database";
  sessionSecretReady: boolean;
  cogdocApiUrlConfigured: boolean;
  cogdocApiKeyConfigured: boolean;
  storageMode: "local" | "s3";
};

export type ReadinessInput = {
  profile: ReadinessProfile | null;
  socialLinks: ReadinessSocialLink[];
  focusAreas: ReadinessFocusArea[];
  experiences: ReadinessExperience[];
  projects: ReadinessProject[];
  posts: ReadinessPost[];
  knowledgeBases: ReadinessKnowledgeBase[];
  env: ReadinessEnvironment;
};

export type ReadinessLinkTarget = {
  url: string;
  label: string;
  source: string;
};
