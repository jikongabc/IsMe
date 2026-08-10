import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  createBlankPortfolioPack,
  PORTFOLIO_PACK_SECTIONS,
} from "@/lib/portfolio-pack";
import { createPortfolioPackPreviewPlan, projectPortfolioPackReadinessInput } from "@/lib/portfolio-pack/planner";
import {
  applyPortfolioPack,
  createSafeDemoCleanupCandidate,
  createPortfolioSetupSnapshot,
  PortfolioPackConflictError,
  previewPortfolioPack,
  previewDemoCleanup,
  readCurrentPortfolioPack,
} from "@/lib/portfolio-pack/server";
import { getDb, getSqlite, initializeDatabase } from "@/lib/db";
import {
  blogPosts,
  experiences,
  focusAreas,
  knowledgeBaseModules,
  siteProfiles,
  socialLinks,
} from "@/lib/db/schema";
import { seedDemoIfEmpty } from "@/lib/db/seed";
import type { ReadinessInput } from "@/lib/readiness/types";

const originalDatabasePath = process.env.ISME_DATABASE_PATH;
let tempDirectory = "";

const environment: ReadinessInput["env"] = {
  nodeEnv: "development",
  siteUrl: "http://localhost:3000",
  adminEnvironmentReady: true,
  adminCredentialReady: true,
  adminCredentialSource: "database",
  sessionSecretReady: true,
  cogdocApiUrlConfigured: false,
  cogdocApiKeyConfigured: false,
  storageMode: "local",
};

function closeDatabase() {
  global.__ismeSqlite?.close();
  global.__ismeSqlite = undefined;
  global.__ismeDb = undefined;
}

function readinessFor(pack: ReturnType<typeof readCurrentPortfolioPack>): ReadinessInput {
  return projectPortfolioPackReadinessInput(
    {
      profile: null,
      socialLinks: [],
      focusAreas: [],
      experiences: [],
      projects: [],
      posts: [],
      knowledgeBases: [],
      env: environment,
    },
    pack,
    PORTFOLIO_PACK_SECTIONS,
  );
}

beforeEach(async () => {
  closeDatabase();
  tempDirectory = mkdtempSync(join(tmpdir(), "isme-portfolio-pack-"));
  process.env.ISME_DATABASE_PATH = join(tempDirectory, "isme.db");
  initializeDatabase();
  await seedDemoIfEmpty(true);
});

afterEach(() => {
  closeDatabase();
  if (originalDatabasePath === undefined) delete process.env.ISME_DATABASE_PATH;
  else process.env.ISME_DATABASE_PATH = originalDatabasePath;
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = "";
});

describe("portfolio pack server persistence", () => {
  it("exports public DTOs only and keeps singleton demo counts within the snapshot contract", () => {
    const db = getDb();
    const profile = db.select().from(siteProfiles).limit(1).all()[0]!;
    const kb = db.select().from(knowledgeBaseModules).limit(1).all()[0]!;
    db.update(siteProfiles)
      .set({ adminPasswordHash: "scrypt$private-hash-material" })
      .where(eq(siteProfiles.id, profile.id))
      .run();
    db.update(knowledgeBaseModules)
      .set({ cogdocKbId: "internal-kb-secret", lastContentSyncSummary: "internal sync detail" })
      .where(eq(knowledgeBaseModules.id, kb.id))
      .run();

    const pack = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const serialized = JSON.stringify(pack);
    expect(serialized).not.toContain("private-hash-material");
    expect(serialized).not.toContain("internal-kb-secret");
    expect(serialized).not.toContain("internal sync detail");

    const snapshot = createPortfolioSetupSnapshot(pack, readinessFor(pack));
    expect(snapshot.counts.profile).toBe(1);
    expect(snapshot.demoExactMatchCounts.profile).toBeLessThanOrEqual(1);
    expect(snapshot.counts.appearance).toBe(0);
    expect(snapshot.demoExactMatchCounts.appearance).toBe(0);
    expect(snapshot.recommendedSelection).toContain("profile");

    db.update(siteProfiles)
      .set({ displayName: "Real person with residual demo fields" })
      .where(eq(siteProfiles.id, profile.id))
      .run();
    const mixed = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const mixedSnapshot = createPortfolioSetupSnapshot(mixed, readinessFor(mixed));
    expect(mixedSnapshot.demoExactMatchCounts.profile).toBe(0);
    expect(mixedSnapshot.counts.profile - mixedSnapshot.demoExactMatchCounts.profile).toBe(1);
    expect(mixedSnapshot.recommendedSelection).not.toContain("profile");
  });

  it("applies selected sections atomically while preserving local secrets and matching KB bindings", () => {
    const db = getDb();
    const profile = db.select().from(siteProfiles).limit(1).all()[0]!;
    const existingKb = db.select().from(knowledgeBaseModules).limit(1).all()[0]!;
    db.update(siteProfiles)
      .set({ adminPasswordHash: "scrypt$must-survive" })
      .where(eq(siteProfiles.id, profile.id))
      .run();
    db.update(knowledgeBaseModules)
      .set({ cogdocKbId: "kb-bound-locally", enabled: true })
      .where(eq(knowledgeBaseModules.id, existingKb.id))
      .run();

    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const incoming = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    incoming.sections.profile = {
      ...incoming.sections.profile,
      siteName: "Real portfolio",
      displayName: "Lin",
      role: "Engineer",
    };
    incoming.sections.knowledgeBases = [
      {
        ...current.sections.knowledgeBases.find((item) => item.slug === existingKb.slug)!,
        name: "Updated local module copy",
      },
      {
        name: "Imported module",
        nameEn: "",
        slug: "imported-module",
        description: "",
        descriptionEn: "",
        welcomeMessage: "",
        welcomeMessageEn: "",
        suggestedQuestions: [],
        suggestedQuestionsEn: [],
        sortOrder: 20,
      },
    ];
    const preview = previewPortfolioPack(
      incoming,
      ["profile", "knowledgeBases"],
      readinessFor(current),
    );

    const result = applyPortfolioPack({
      incoming,
      selection: ["profile", "knowledgeBases"],
      expectedFingerprint: preview.fingerprint,
      appliedAt: "2026-08-10T01:00:00.000Z",
    });

    expect(result.selectedSections).toEqual(["profile", "knowledgeBases"]);
    expect(db.select().from(siteProfiles).limit(1).all()[0]).toMatchObject({
      displayName: "Lin",
      adminPasswordHash: "scrypt$must-survive",
    });
    const modules = db.select().from(knowledgeBaseModules).all();
    expect(modules.find((item) => item.slug === existingKb.slug)).toMatchObject({
      name: "Updated local module copy",
      cogdocKbId: "kb-bound-locally",
      enabled: true,
    });
    expect(modules.find((item) => item.slug === "imported-module")).toMatchObject({
      cogdocKbId: "",
      enabled: false,
    });
  });

  it("rejects a stale preview without overwriting the concurrent edit", () => {
    const db = getDb();
    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const incoming = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    incoming.sections.profile.displayName = "Imported name";
    const preview = createPortfolioPackPreviewPlan({
      current,
      incoming,
      selection: ["profile"],
    });
    const profile = db.select().from(siteProfiles).limit(1).all()[0]!;
    db.update(siteProfiles)
      .set({ displayName: "Concurrent name" })
      .where(eq(siteProfiles.id, profile.id))
      .run();

    expect(() => applyPortfolioPack({
      incoming,
      selection: ["profile"],
      expectedFingerprint: preview.fingerprint,
    })).toThrow(PortfolioPackConflictError);
    expect(db.select().from(siteProfiles).limit(1).all()[0]?.displayName).toBe("Concurrent name");
  });

  it("preserves stable IDs when a selected collection has no portable changes", () => {
    const db = getDb();
    const before = {
      links: db.select().from(socialLinks).all().map((item) => item.id).sort(),
      focus: db.select().from(focusAreas).all().map((item) => item.id).sort(),
      experiences: db.select().from(experiences).all().map((item) => item.id).sort(),
    };
    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const preview = createPortfolioPackPreviewPlan({
      current,
      incoming: current,
      selection: ["socialLinks", "focusAreas", "experiences"],
    });

    applyPortfolioPack({
      incoming: current,
      selection: ["socialLinks", "focusAreas", "experiences"],
      expectedFingerprint: preview.fingerprint,
    });

    expect(db.select().from(socialLinks).all().map((item) => item.id).sort()).toEqual(before.links);
    expect(db.select().from(focusAreas).all().map((item) => item.id).sort()).toEqual(before.focus);
    expect(db.select().from(experiences).all().map((item) => item.id).sort()).toEqual(before.experiences);
  });

  it("keeps a seed-looking knowledge module when its local binding was changed", () => {
    const db = getDb();
    const kbModule = db.select().from(knowledgeBaseModules).limit(1).all()[0]!;
    db.update(knowledgeBaseModules)
      .set({
        cogdocKbId: "real-production-binding",
        lastContentSyncSummary: "completed real sync",
      })
      .where(eq(knowledgeBaseModules.id, kbModule.id))
      .run();

    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const { candidate, protectedSlugs } = createSafeDemoCleanupCandidate(current);

    expect(protectedSlugs).toContain(kbModule.slug);
    expect(candidate.sections.knowledgeBases.map((item) => item.slug)).toContain(kbModule.slug);
  });

  it("does not classify the intentionally blank post-cleanup singleton rows as demo", () => {
    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const { candidate } = createSafeDemoCleanupCandidate(current);
    const cleanupPlan = previewDemoCleanup(readinessFor(current));

    applyPortfolioPack({
      incoming: candidate,
      selection: cleanupPlan.selectedSections,
      expectedFingerprint: cleanupPlan.fingerprint,
    });
    const cleaned = readCurrentPortfolioPack("2026-08-10T02:00:00.000Z");
    const snapshot = createPortfolioSetupSnapshot(cleaned, readinessFor(cleaned));

    expect(Object.values(snapshot.demoExactMatchCounts).reduce((sum, count) => sum + count, 0))
      .toBe(0);
    expect(snapshot.hasPlaceholders).toBe(false);
    expect(snapshot.counts.profile).toBe(0);
    expect(snapshot.counts.appearance).toBe(0);
  });

  it("invalidates a KB preview when excluded local binding state changes", () => {
    const db = getDb();
    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const incoming = structuredClone(current);
    incoming.sections.knowledgeBases[0]!.name = "Portable copy update";
    const preview = previewPortfolioPack(
      incoming,
      ["knowledgeBases"],
      readinessFor(current),
    );
    const kbModule = db.select().from(knowledgeBaseModules).limit(1).all()[0]!;
    db.update(knowledgeBaseModules)
      .set({ cogdocKbId: "bound-after-preview" })
      .where(eq(knowledgeBaseModules.id, kbModule.id))
      .run();

    expect(() => applyPortfolioPack({
      incoming,
      selection: ["knowledgeBases"],
      expectedFingerprint: preview.fingerprint,
    })).toThrow(PortfolioPackConflictError);
    expect(
      db.select().from(knowledgeBaseModules).where(eq(knowledgeBaseModules.id, kbModule.id)).limit(1).all()[0]
        ?.cogdocKbId,
    ).toBe("bound-after-preview");
  });

  it("rolls every selected table back when a later insert fails", () => {
    const db = getDb();
    const current = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    const originalName = current.sections.profile.displayName;
    const originalPostTitles = current.sections.posts.map((item) => item.title);
    const incoming = structuredClone(current);
    incoming.sections.profile.displayName = "Must roll back";
    incoming.sections.posts[0]!.title = "Trigger a post rewrite";
    const preview = createPortfolioPackPreviewPlan({
      current,
      incoming,
      selection: ["profile", "posts"],
    });
    getSqlite().exec(`
      CREATE TRIGGER fail_portfolio_pack_post_insert
      BEFORE INSERT ON blog_posts
      BEGIN
        SELECT RAISE(ABORT, 'forced portfolio pack rollback');
      END;
    `);

    expect(() => applyPortfolioPack({
      incoming,
      selection: ["profile", "posts"],
      expectedFingerprint: preview.fingerprint,
    })).toThrow(/forced portfolio pack rollback/);
    expect(db.select().from(siteProfiles).limit(1).all()[0]?.displayName).toBe(originalName);
    expect(db.select().from(blogPosts).all().map((item) => item.title).sort()).toEqual(
      [...originalPostTitles].sort(),
    );
  });

  it("coerces a legacy appearance whose enabled themes omit the default", () => {
    const db = getDb();
    const profile = db.select().from(siteProfiles).limit(1).all()[0]!;
    db.update(siteProfiles)
      .set({ theme: "ocean", themeConfig: { enabledThemes: ["terminal"] } })
      .where(eq(siteProfiles.id, profile.id))
      .run();

    const exported = readCurrentPortfolioPack("2026-08-10T00:00:00.000Z");
    expect(exported.sections.appearance.theme).toBe("ocean");
    expect(exported.sections.appearance.enabledThemes).toContain("ocean");
  });
});
