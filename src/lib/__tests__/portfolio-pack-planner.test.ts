import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  createBlankPortfolioPack,
  PORTFOLIO_PACK_SECTIONS,
  type PortfolioPackProject,
} from "@/lib/portfolio-pack";
import {
  createPortfolioPackPreviewPlan,
  mergePortfolioPackSelection,
} from "@/lib/portfolio-pack/planner";
import type { ReadinessInput } from "@/lib/readiness/types";

const environment: ReadinessInput["env"] = {
  nodeEnv: "development",
  siteUrl: "http://localhost:3000",
  adminEnvironmentReady: true,
  adminCredentialReady: true,
  adminCredentialSource: "environment",
  sessionSecretReady: true,
  cogdocApiUrlConfigured: false,
  cogdocApiKeyConfigured: false,
  storageMode: "local",
};

function emptyReadiness(): ReadinessInput {
  return {
    profile: null,
    socialLinks: [],
    focusAreas: [],
    experiences: [],
    projects: [],
    posts: [],
    knowledgeBases: [],
    env: environment,
  };
}

function weakProject(): PortfolioPackProject {
  return {
    name: "Thin case",
    nameEn: "",
    slug: "thin-case",
    summary: "",
    summaryEn: "",
    description: "",
    descriptionEn: "",
    contentFormat: "markdown",
    coverUrl: "",
    repositoryUrl: "",
    demoUrl: "",
    techStack: [],
    role: "",
    roleEn: "",
    teamSize: 0,
    duration: "",
    durationEn: "",
    metrics: [],
    decisions: [],
    gallery: [],
    featured: false,
    sortOrder: 0,
    status: "published",
  };
}

describe("portfolio pack planner", () => {
  it("normalizes unsafe publication claims and returns a bound preview fingerprint", () => {
    const current = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    const incoming = structuredClone(current);
    incoming.sections.profile.displayName = "Lin";
    incoming.sections.projects = [weakProject()];

    const plan = createPortfolioPackPreviewPlan({
      current,
      incoming,
      selection: ["profile", "projects"],
      readinessInput: emptyReadiness(),
    });

    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.selectedSections).toEqual(["profile", "projects"]);
    expect(plan.sections.find((section) => section.section === "projects")).toMatchObject({
      added: 1,
      selected: true,
    });
    expect(plan.publicationAdjustments).toEqual([
      expect.objectContaining({ action: "demote-to-draft", slug: "thin-case" }),
    ]);
    expect(plan.readiness?.projected.counts.blocker).toBeGreaterThan(0);
  });

  it("does not mutate publication state in an unselected section", () => {
    const current = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    current.sections.projects = [weakProject()];
    const incoming = structuredClone(current);
    incoming.sections.profile.displayName = "Only profile changes";

    const normalized = mergePortfolioPackSelection(current, incoming, ["profile"]);

    expect(normalized.pack.sections.projects[0]?.status).toBe("published");
    expect(normalized.adjustments).toEqual([]);
  });

  it("binds the fingerprint only to selected current and projected content", () => {
    const current = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    const incoming = structuredClone(current);
    incoming.sections.profile.displayName = "Selected identity";
    const original = createPortfolioPackPreviewPlan({
      current,
      incoming,
      selection: ["profile"],
    });

    const unselectedChange = structuredClone(current);
    unselectedChange.sections.focusAreas.push({
      title: "Unselected",
      titleEn: "",
      description: "",
      descriptionEn: "",
      tags: [],
      sortOrder: 0,
      visible: true,
    });
    const sameFingerprint = createPortfolioPackPreviewPlan({
      current: unselectedChange,
      incoming,
      selection: ["profile"],
    });
    expect(sameFingerprint.fingerprint).toBe(original.fingerprint);

    const selectedChange = structuredClone(current);
    selectedChange.sections.profile.role = "Concurrent edit";
    const stale = createPortfolioPackPreviewPlan({
      current: selectedChange,
      incoming,
      selection: ["profile"],
    });
    expect(stale.fingerprint).not.toBe(original.fingerprint);
    expect(PORTFOLIO_PACK_SECTIONS).toHaveLength(8);
  });

  it("does not let unselected long-form content exhaust the selected media scan", () => {
    const current = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    current.sections.projects = Array.from({ length: 85 }, (_, index) => ({
      ...weakProject(),
      name: `Large current project ${index}`,
      slug: `large-current-project-${index}`,
      description: "x".repeat(12_000),
      status: "draft" as const,
    }));
    const incoming = structuredClone(current);
    incoming.sections.posts = [{
      title: "Selected post",
      titleEn: "",
      slug: "selected-post",
      excerpt: "A selected post",
      excerptEn: "",
      contentMarkdown: "![proof](/uploads/selected-proof.png)",
      contentEn: "",
      contentFormat: "markdown",
      coverUrl: "",
      category: "",
      tags: [],
      status: "draft",
      publishedAt: null,
      updatedAt: "2026-08-10T00:00:00.000Z",
      seoTitle: "",
      seoDescription: "",
    }];

    const plan = createPortfolioPackPreviewPlan({
      current,
      incoming,
      selection: ["posts"],
    });

    expect(plan.mediaReferences).toEqual([
      expect.objectContaining({ url: "/uploads/selected-proof.png", section: "posts" }),
    ]);
    expect(plan.mediaReferencesTruncated).toBe(false);
  });
});
