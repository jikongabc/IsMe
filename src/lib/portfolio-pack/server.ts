import "server-only";

import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { buildReadinessReport } from "@/lib/readiness/report";
import { findPlaceholderMatches } from "@/lib/readiness/placeholders";
import type { ReadinessInput } from "@/lib/readiness/types";
import { demoSeed } from "@/data/demo-seed";
import { getDb, getSqlite } from "@/lib/db";
import {
  blogPosts,
  experiences,
  focusAreas,
  knowledgeBaseModules,
  projects,
  siteProfiles,
  socialLinks,
} from "@/lib/db/schema";
import { coerceThemeConfig, parseThemeConfig, normalizeTheme } from "@/lib/theme";
import {
  collectPortfolioPackMediaReferences,
  createBlankPortfolioPack,
  createDemoCleanupCandidate,
  getPortfolioPackDemoExactMatchCounts,
  isPortfolioPackSectionEmptyOrDemoOnly,
  parsePortfolioPack,
} from ".";
import {
  createPortfolioPackPreviewPlan,
  mergePortfolioPackSelection,
} from "./planner";
import type {
  PortfolioPackApplyResult,
  PortfolioPackPreviewPlan,
  PortfolioPackReadinessSummary,
  PortfolioPackSection,
  PortfolioSetupSnapshot,
  PortfolioPackV1,
} from "./types";
import { PORTFOLIO_PACK_SECTIONS, PORTFOLIO_PACK_VERSION } from "./types";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function readinessSummary(input: ReadinessInput): PortfolioPackReadinessSummary {
  const report = buildReadinessReport(input);
  return { score: report.score, readyToShare: report.readyToShare, counts: report.counts };
}

/**
 * Read the portable public content snapshot. Password hashes, CogDoc bindings,
 * enabled flags, internal IDs, sync metadata, and credentials are never copied.
 */
export function readCurrentPortfolioPack(
  exportedAt = new Date().toISOString(),
): PortfolioPackV1 {
  const db = getDb();
  const blank = createBlankPortfolioPack(exportedAt);
  const profile = db.select().from(siteProfiles).limit(1).all()[0];
  const theme = normalizeTheme(profile?.theme);
  const appearance = profile
    ? coerceThemeConfig(parseThemeConfig(profile.themeConfig), theme)
    : {
        enabledThemes: blank.sections.appearance.enabledThemes,
        accent: "",
        accent2: "",
      };

  const pack: PortfolioPackV1 = {
    version: PORTFOLIO_PACK_VERSION,
    exportedAt,
    sections: {
      profile: profile
        ? {
            siteName: profile.siteName,
            displayName: profile.displayName,
            englishName: profile.englishName,
            role: profile.role,
            roleEn: profile.roleEn,
            headline: profile.headline,
            headlineEn: profile.headlineEn,
            introduction: profile.introduction,
            introductionEn: profile.introductionEn,
            avatarUrl: profile.avatarUrl,
            location: profile.location,
            publicEmail: profile.publicEmail,
            availability: profile.availability,
            availabilityEn: profile.availabilityEn,
          }
        : blank.sections.profile,
      appearance: profile
        ? {
            theme,
            defaultLocale: profile.defaultLocale === "en" ? "en" : "zh",
            enabledThemes: appearance.enabledThemes,
            accent: appearance.accent,
            accent2: appearance.accent2,
          }
        : blank.sections.appearance,
      socialLinks: db
        .select()
        .from(socialLinks)
        .orderBy(asc(socialLinks.sortOrder), asc(socialLinks.id))
        .all()
        .map(({ platform, label, url, sortOrder, visible }) => ({
          platform,
          label,
          url,
          sortOrder,
          visible,
        })),
      focusAreas: db
        .select()
        .from(focusAreas)
        .orderBy(asc(focusAreas.sortOrder), asc(focusAreas.id))
        .all()
        .map(({ title, titleEn, description, descriptionEn, tags, sortOrder, visible }) => ({
          title,
          titleEn,
          description,
          descriptionEn,
          tags: [...tags],
          sortOrder,
          visible,
        })),
      experiences: db
        .select()
        .from(experiences)
        .orderBy(asc(experiences.sortOrder), asc(experiences.id))
        .all()
        .map((item) => ({
          type: item.type as "work" | "education" | "project" | "competition" | "other",
          organization: item.organization,
          organizationEn: item.organizationEn,
          role: item.role,
          roleEn: item.roleEn,
          startDate: item.startDate,
          endDate: item.endDate,
          description: item.description,
          descriptionEn: item.descriptionEn,
          skills: [...item.skills],
          sortOrder: item.sortOrder,
          visible: item.visible,
        })),
      projects: db
        .select()
        .from(projects)
        .orderBy(asc(projects.sortOrder), asc(projects.id))
        .all()
        .map((item) => ({
          name: item.name,
          nameEn: item.nameEn,
          slug: item.slug,
          summary: item.summary,
          summaryEn: item.summaryEn,
          description: item.description,
          descriptionEn: item.descriptionEn,
          contentFormat: item.contentFormat as "markdown" | "html",
          coverUrl: item.coverUrl,
          repositoryUrl: item.repositoryUrl,
          demoUrl: item.demoUrl,
          techStack: [...item.techStack],
          role: item.role,
          roleEn: item.roleEn,
          teamSize: item.teamSize,
          duration: item.duration,
          durationEn: item.durationEn,
          metrics: item.metrics.map((metric) => ({
            label: metric.label,
            value: metric.value,
            context: metric.context,
            labelEn: metric.labelEn ?? "",
            valueEn: metric.valueEn ?? "",
            contextEn: metric.contextEn ?? "",
          })),
          decisions: item.decisions.map((decision) => ({
            title: decision.title,
            tradeoff: decision.tradeoff,
            titleEn: decision.titleEn ?? "",
            tradeoffEn: decision.tradeoffEn ?? "",
          })),
          gallery: item.gallery.map((image) => ({
            src: image.src,
            alt: image.alt,
            caption: image.caption,
            altEn: image.altEn ?? "",
            captionEn: image.captionEn ?? "",
          })),
          featured: item.featured,
          sortOrder: item.sortOrder,
          status: item.status as "draft" | "published" | "archived",
        })),
      posts: db
        .select()
        .from(blogPosts)
        .orderBy(desc(blogPosts.updatedAt), asc(blogPosts.id))
        .all()
        .map((item) => ({
          title: item.title,
          titleEn: item.titleEn,
          slug: item.slug,
          excerpt: item.excerpt,
          excerptEn: item.excerptEn,
          contentMarkdown: item.contentMarkdown,
          contentEn: item.contentEn,
          contentFormat: item.contentFormat as "markdown" | "html",
          coverUrl: item.coverUrl,
          category: item.category,
          tags: [...item.tags],
          status: item.status as "draft" | "published" | "archived",
          publishedAt: item.publishedAt,
          updatedAt: item.updatedAt,
          seoTitle: item.seoTitle,
          seoDescription: item.seoDescription,
        })),
      knowledgeBases: db
        .select()
        .from(knowledgeBaseModules)
        .orderBy(asc(knowledgeBaseModules.sortOrder), asc(knowledgeBaseModules.id))
        .all()
        .map((item) => ({
          name: item.name,
          nameEn: item.nameEn,
          slug: item.slug,
          description: item.description,
          descriptionEn: item.descriptionEn,
          welcomeMessage: item.welcomeMessage,
          welcomeMessageEn: item.welcomeMessageEn,
          suggestedQuestions: [...item.suggestedQuestions],
          suggestedQuestionsEn: [...item.suggestedQuestionsEn],
          sortOrder: item.sortOrder,
        })),
    },
  };
  return parsePortfolioPack(pack);
}

export function createPortfolioSetupSnapshot(
  currentInput: PortfolioPackV1,
  readinessInput: ReadinessInput,
): PortfolioSetupSnapshot {
  const current = parsePortfolioPack(currentInput);
  const blank = createBlankPortfolioPack(current.exportedAt);
  const exactMatches = getPortfolioPackDemoExactMatchCounts(current);
  const profilePresent = readinessInput.profile !== null;
  const protectedDemoKnowledgeBases = protectedDemoKnowledgeBaseSlugs();
  const cleanupCandidate = createDemoCleanupCandidate(current);
  const cleanupKbSlugs = new Set(
    cleanupCandidate.sections.knowledgeBases.map((item) => item.slug),
  );
  const protectedExactDemoKnowledgeBases = current.sections.knowledgeBases.filter(
    (item) =>
      !cleanupKbSlugs.has(item.slug)
      && protectedDemoKnowledgeBases.has(item.slug),
  ).length;
  const profileEmpty =
    JSON.stringify(current.sections.profile) === JSON.stringify(blank.sections.profile);
  const appearanceEmpty =
    JSON.stringify(current.sections.appearance) === JSON.stringify(blank.sections.appearance);
  const profileDemoOnly =
    profilePresent
    && !profileEmpty
    && isPortfolioPackSectionEmptyOrDemoOnly(current, "profile");
  const counts = {
    profile: profilePresent && !profileEmpty ? 1 : 0,
    appearance: profilePresent && !appearanceEmpty ? 1 : 0,
    socialLinks: current.sections.socialLinks.length,
    focusAreas: current.sections.focusAreas.length,
    experiences: current.sections.experiences.length,
    projects: current.sections.projects.length,
    posts: current.sections.posts.length,
    knowledgeBases: current.sections.knowledgeBases.length,
  };
  const demoExactMatchCounts = {
    profile: profileDemoOnly ? 1 : 0,
    appearance: 0,
    socialLinks: exactMatches.socialLinks,
    focusAreas: exactMatches.focusAreas,
    experiences: exactMatches.experiences,
    projects: exactMatches.projects,
    posts: exactMatches.posts,
    knowledgeBases: Math.max(
      0,
      exactMatches.knowledgeBases - protectedExactDemoKnowledgeBases,
    ),
  };
  const scan = collectPortfolioPackMediaReferences(current);
  const localUploads = scan.references.filter((item) => item.kind === "local-upload").length;
  const external = scan.references.filter((item) => item.kind === "external").length;
  const recommendedSelection = PORTFOLIO_PACK_SECTIONS.filter((section) =>
    isPortfolioPackSectionEmptyOrDemoOnly(current, section),
  );

  return {
    counts,
    demoExactMatchCounts,
    hasPlaceholders: findPlaceholderMatches(current.sections).length > 0,
    hasRealContent: PORTFOLIO_PACK_SECTIONS.some(
      (section) => !isPortfolioPackSectionEmptyOrDemoOnly(current, section),
    ),
    defaultLocale: current.sections.appearance.defaultLocale,
    recommendedSelection,
    mediaWarningCounts: {
      localUploads,
      external,
      total: scan.references.length,
      truncated: scan.truncated,
    },
    beforeReadiness: readinessSummary(readinessInput),
  };
}

export function previewPortfolioPack(
  incoming: PortfolioPackV1,
  selection: readonly PortfolioPackSection[],
  readinessInput: ReadinessInput,
): PortfolioPackPreviewPlan {
  return createPortfolioPackPreviewPlan({
    current: readCurrentPortfolioPack(),
    incoming,
    selection,
    readinessInput,
    interlockSalt: portfolioPackInterlockSalt(selection),
  });
}

export function previewDemoCleanup(readinessInput: ReadinessInput): PortfolioPackPreviewPlan {
  const current = readCurrentPortfolioPack();
  const { candidate, protectedSlugs } = createSafeDemoCleanupCandidate(current);
  const selection = demoCleanupSelection(current, candidate);
  const plan = createPortfolioPackPreviewPlan({
    current,
    incoming: candidate,
    selection,
    readinessInput,
    interlockSalt: portfolioPackInterlockSalt(selection),
  });
  if (protectedSlugs.length > 0) {
    plan.warnings.push({
      code: "configured-demo-kb-preserved",
      severity: "warning",
      section: "knowledgeBases",
      detail: `有 ${protectedSlugs.length} 个 seed 文案模块包含本机修改过的 CogDoc 绑定或同步状态，批量清理会保留它们。`,
    });
  }
  if (selection.length === 0) {
    plan.blockers.push({
      code: "no-demo-cleanup-changes",
      severity: "blocker",
      detail: "没有可安全批量移除的精确 demo 内容；未执行任何写入。",
    });
  }
  return plan;
}

function protectedDemoKnowledgeBaseSlugs(): Set<string> {
  const seedBySlug = new Map<string, (typeof demoSeed.knowledgeBases)[number]>(
    demoSeed.knowledgeBases.map((item) => [item.slug, item]),
  );
  const protectedSlugs = new Set<string>();
  for (const row of getDb().select().from(knowledgeBaseModules).all()) {
    const seed = seedBySlug.get(row.slug);
    if (!seed) continue;
    if (
      row.cogdocKbId !== seed.cogdocKbId
      || row.enabled !== seed.enabled
      || Boolean(row.lastContentSyncAt.trim())
      || Boolean(row.lastContentSyncSummary.trim())
    ) {
      protectedSlugs.add(row.slug);
    }
  }
  return protectedSlugs;
}

export function createSafeDemoCleanupCandidate(currentInput: PortfolioPackV1): {
  candidate: PortfolioPackV1;
  protectedSlugs: string[];
} {
  const current = parsePortfolioPack(currentInput);
  const candidate = createDemoCleanupCandidate(current);
  const protectedSlugs = protectedDemoKnowledgeBaseSlugs();
  if (protectedSlugs.size > 0) {
    const kept = new Set(candidate.sections.knowledgeBases.map((item) => item.slug));
    candidate.sections.knowledgeBases = current.sections.knowledgeBases.filter(
      (item) => kept.has(item.slug) || protectedSlugs.has(item.slug),
    );
  }
  return { candidate: parsePortfolioPack(candidate), protectedSlugs: [...protectedSlugs] };
}

export function demoCleanupSelection(
  current: PortfolioPackV1,
  candidate: PortfolioPackV1,
): PortfolioPackSection[] {
  return PORTFOLIO_PACK_SECTIONS.filter(
    (section) => JSON.stringify(current.sections[section]) !== JSON.stringify(candidate.sections[section]),
  );
}

function portfolioPackInterlockSalt(selection: readonly PortfolioPackSection[]): string {
  if (!selection.includes("knowledgeBases")) return "";
  const localState = getDb()
    .select()
    .from(knowledgeBaseModules)
    .orderBy(asc(knowledgeBaseModules.slug), asc(knowledgeBaseModules.id))
    .all()
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      cogdocKbId: item.cogdocKbId,
      enabled: item.enabled,
      lastContentSyncAt: item.lastContentSyncAt,
      lastContentSyncSummary: item.lastContentSyncSummary,
    }));
  return createHash("sha256").update(JSON.stringify(localState)).digest("hex");
}

export class PortfolioPackConflictError extends Error {
  constructor() {
    super("Portfolio pack preview is stale");
    this.name = "PortfolioPackConflictError";
  }
}

function sameSection(
  current: PortfolioPackV1,
  projected: PortfolioPackV1,
  section: PortfolioPackSection,
): boolean {
  return JSON.stringify(current.sections[section]) === JSON.stringify(projected.sections[section]);
}

function reusableIds<T>(rows: T[], key: (row: T) => string): Map<string, string[]> {
  const ids = new Map<string, string[]>();
  for (const row of rows as Array<T & { id: string }>) {
    const value = key(row);
    ids.set(value, [...(ids.get(value) ?? []), row.id]);
  }
  return ids;
}

function takeId(ids: Map<string, string[]>, key: string, prefix: string): string {
  return ids.get(key)?.shift() ?? newId(prefix);
}

function replaceCollections(
  current: PortfolioPackV1,
  projected: PortfolioPackV1,
  selection: Set<PortfolioPackSection>,
  appliedAt: string,
) {
  const db = getDb();

  if (selection.has("socialLinks") && !sameSection(current, projected, "socialLinks")) {
    const ids = reusableIds(
      db.select().from(socialLinks).orderBy(asc(socialLinks.sortOrder), asc(socialLinks.id)).all(),
      (item) => `${item.platform.toLowerCase()}|${item.label}`,
    );
    db.delete(socialLinks).run();
    if (projected.sections.socialLinks.length > 0) {
      db.insert(socialLinks).values(projected.sections.socialLinks.map((item) => ({
        id: takeId(ids, `${item.platform.toLowerCase()}|${item.label}`, "link"),
        ...item,
      }))).run();
    }
  }

  if (selection.has("focusAreas") && !sameSection(current, projected, "focusAreas")) {
    const ids = reusableIds(
      db.select().from(focusAreas).orderBy(asc(focusAreas.sortOrder), asc(focusAreas.id)).all(),
      (item) => `${item.title}|${item.titleEn}`,
    );
    db.delete(focusAreas).run();
    if (projected.sections.focusAreas.length > 0) {
      db.insert(focusAreas).values(projected.sections.focusAreas.map((item) => ({
        id: takeId(ids, `${item.title}|${item.titleEn}`, "focus"),
        ...item,
      }))).run();
    }
  }

  if (selection.has("experiences") && !sameSection(current, projected, "experiences")) {
    const experienceKey = (item: {
      type: string;
      organization: string;
      role: string;
      startDate: string;
    }) => [item.type, item.organization, item.role, item.startDate].join("|");
    const ids = reusableIds(
      db.select().from(experiences).orderBy(asc(experiences.sortOrder), asc(experiences.id)).all(),
      experienceKey,
    );
    db.delete(experiences).run();
    if (projected.sections.experiences.length > 0) {
      db.insert(experiences).values(projected.sections.experiences.map((item) => ({
        id: takeId(ids, experienceKey(item), "exp"),
        ...item,
      }))).run();
    }
  }

  if (selection.has("projects") && !sameSection(current, projected, "projects")) {
    const existing = new Map(db.select().from(projects).all().map((item) => [item.slug, item]));
    db.delete(projects).run();
    if (projected.sections.projects.length > 0) {
      db.insert(projects).values(projected.sections.projects.map((item) => ({
        id: existing.get(item.slug)?.id ?? newId("proj"),
        ...item,
      }))).run();
    }
  }

  if (selection.has("posts") && !sameSection(current, projected, "posts")) {
    const existing = new Map(db.select().from(blogPosts).all().map((item) => [item.slug, item]));
    db.delete(blogPosts).run();
    if (projected.sections.posts.length > 0) {
      db.insert(blogPosts).values(projected.sections.posts.map((item) => {
        const previous = existing.get(item.slug);
        return {
          id: previous?.id ?? newId("post"),
          ...item,
          createdAt: previous?.createdAt ?? appliedAt,
        };
      })).run();
    }
  }

  if (selection.has("knowledgeBases") && !sameSection(current, projected, "knowledgeBases")) {
    const existing = new Map(
      db.select().from(knowledgeBaseModules).all().map((item) => [item.slug, item]),
    );
    db.delete(knowledgeBaseModules).run();
    if (projected.sections.knowledgeBases.length > 0) {
      db.insert(knowledgeBaseModules).values(projected.sections.knowledgeBases.map((item) => {
        const previous = existing.get(item.slug);
        return {
          id: previous?.id ?? newId("kb"),
          ...item,
          cogdocKbId: previous?.cogdocKbId ?? "",
          enabled: previous?.enabled ?? false,
          lastContentSyncAt: previous?.lastContentSyncAt ?? "",
          lastContentSyncSummary: previous?.lastContentSyncSummary ?? "",
          createdAt: previous?.createdAt ?? appliedAt,
          updatedAt: appliedAt,
        };
      })).run();
    }
  }
}

function replaceProfile(
  current: PortfolioPackV1,
  projected: PortfolioPackV1,
  selection: Set<PortfolioPackSection>,
  appliedAt: string,
) {
  if (!selection.has("profile") && !selection.has("appearance")) return;
  if (
    (!selection.has("profile") || sameSection(current, projected, "profile"))
    && (!selection.has("appearance") || sameSection(current, projected, "appearance"))
  ) return;
  const db = getDb();
  const existing = db.select().from(siteProfiles).limit(1).all()[0];
  const profile = projected.sections.profile;
  const appearance = projected.sections.appearance;
  const profileValues = selection.has("profile") ? profile : {};
  const appearanceValues = selection.has("appearance")
    ? {
        theme: appearance.theme,
        defaultLocale: appearance.defaultLocale,
        themeConfig: {
          enabledThemes: appearance.enabledThemes,
          accent: appearance.accent,
          accent2: appearance.accent2,
        },
      }
    : {};

  if (existing) {
    db.update(siteProfiles)
      .set({ ...profileValues, ...appearanceValues, updatedAt: appliedAt })
      .where(eq(siteProfiles.id, existing.id))
      .run();
    return;
  }

  db.insert(siteProfiles).values({
    id: newId("profile"),
    ...(selection.has("profile") ? profile : createBlankPortfolioPack(appliedAt).sections.profile),
    ...(selection.has("appearance")
      ? appearanceValues
      : {
          theme: "terminal",
          defaultLocale: "zh",
          themeConfig: {},
        }),
    adminPasswordHash: "",
    createdAt: appliedAt,
    updatedAt: appliedAt,
  }).run();
}

export type ApplyPortfolioPackInput = {
  incoming: PortfolioPackV1;
  selection: readonly PortfolioPackSection[];
  expectedFingerprint: string;
  appliedAt?: string;
};

/** Verify the preview interlock and replace every selected section in one IMMEDIATE transaction. */
export function applyPortfolioPack(input: ApplyPortfolioPackInput): PortfolioPackApplyResult {
  const incoming = parsePortfolioPack(input.incoming);
  const selectedSections = PORTFOLIO_PACK_SECTIONS.filter((section) =>
    input.selection.includes(section),
  );
  const appliedAt = input.appliedAt ?? new Date().toISOString();
  const sqlite = getSqlite();

  const transaction = sqlite.transaction(() => {
    const current = readCurrentPortfolioPack(appliedAt);
    const preview = createPortfolioPackPreviewPlan({
      current,
      incoming,
      selection: selectedSections,
      interlockSalt: portfolioPackInterlockSalt(selectedSections),
    });
    if (preview.fingerprint !== input.expectedFingerprint) {
      throw new PortfolioPackConflictError();
    }

    const normalized = mergePortfolioPackSelection(
      current,
      incoming,
      selectedSections,
      appliedAt,
    );
    const selection = new Set(selectedSections);
    replaceProfile(current, normalized.pack, selection, appliedAt);
    replaceCollections(current, normalized.pack, selection, appliedAt);

    return {
      version: PORTFOLIO_PACK_VERSION,
      appliedAt,
      fingerprint: preview.fingerprint,
      selectedSections,
      sections: preview.sections,
      warnings: preview.warnings,
      publicationAdjustments: normalized.adjustments,
    } satisfies PortfolioPackApplyResult;
  });

  return transaction.immediate();
}
