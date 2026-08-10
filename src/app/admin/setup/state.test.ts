import { describe, expect, it } from "vitest";
import { PORTFOLIO_BUNDLE_VERSION } from "@/lib/portfolio-bundle/types";
import {
  decodeStoredStudioDraft,
  defaultSelectedSections,
  encodeStoredStudioDraft,
  MAX_PORTFOLIO_PACK_BYTES,
  MAX_STORED_DRAFT_BYTES,
  parsePortfolioPackDraft,
  tryStoreStudioDraft,
  type SnapshotSection,
} from "./state";
import {
  isValidApplyReceipt,
  normalizeReviewPlan,
  normalizeSetupSnapshot,
} from "./models";

const pack = JSON.stringify({
  version: "portfolio-pack.v1",
  exportedAt: "2026-08-10T00:00:00.000Z",
  sections: {
    profile: { displayName: "林知远" },
    experiences: [{ organization: "Deep Sea Studio" }],
  },
});

const fingerprint = "a".repeat(64);
const planSections = [
  "profile",
  "appearance",
  "socialLinks",
  "focusAreas",
  "experiences",
  "projects",
  "posts",
  "knowledgeBases",
].map((section) => ({
  section,
  current: section === "profile" ? 1 : 0,
  incoming: section === "profile" ? 1 : 0,
  added: 0,
  replaced: section === "profile" ? 1 : 0,
  removed: 0,
  changes: section === "profile"
    ? [{ action: "replace", key: "profile", label: "身份资料", fields: ["role"] }]
    : [],
  changesTruncated: false,
  selected: section === "profile",
  recommended: false,
}));

describe("Launch Studio browser-side draft screening", () => {
  it("accepts a supported JSON object and discovers its public sections", () => {
    const result = parsePortfolioPackDraft(pack);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sections).toEqual(["profile", "experiences"]);
  });

  it("keeps explicitly present empty sections selectable", () => {
    const result = parsePortfolioPackDraft(JSON.stringify({
      version: "portfolio-pack.v1",
      sections: { projects: [], posts: [] },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sections).toEqual(["projects", "posts"]);
  });

  it("rejects malformed, unsupported and oversized drafts before upload", () => {
    expect(parsePortfolioPackDraft("{").ok).toBe(false);
    expect(
      parsePortfolioPackDraft('{"schemaVersion":"portfolio-pack.v1","sections":{"profile":{}}}').ok,
    ).toBe(false);
    expect(
      parsePortfolioPackDraft('{"version":"portfolio-pack.v2","sections":{"profile":{}}}').ok,
    ).toBe(false);
    expect(parsePortfolioPackDraft("x".repeat(MAX_PORTFOLIO_PACK_BYTES + 1)).ok).toBe(false);
  });

  it("recognizes a self-contained bundle and exposes its nested pack sections", () => {
    const result = parsePortfolioPackDraft(JSON.stringify({
      version: PORTFOLIO_BUNDLE_VERSION,
      exportedAt: "2026-08-10T00:00:00.000Z",
      pack: JSON.parse(pack),
      assets: [{ bytes: 12 }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.format).toBe("bundle");
    expect(result.value.pack.version).toBe("portfolio-pack.v1");
    expect(result.value.sections).toEqual(["profile", "experiences"]);
    expect(result.value.assetCount).toBe(1);
    expect(result.value.assetBytes).toBe(12);
  });
});

describe("Launch Studio overwrite interlock", () => {
  const snapshot: SnapshotSection[] = [
    { key: "profile", count: 1, demoCount: 1, realCount: 0 },
    { key: "experiences", count: 3, demoCount: 1, realCount: 2 },
    { key: "projects", count: 0, demoCount: 0, realCount: 0 },
  ];

  it("preselects empty or demo-only destinations but never real content", () => {
    expect(defaultSelectedSections(["profile", "experiences", "projects"], snapshot)).toEqual([
      "profile",
      "projects",
    ]);
  });

  it("honors the server recommendation without selecting real destinations", () => {
    expect(
      defaultSelectedSections(
        ["profile", "experiences", "projects"],
        snapshot,
        ["experiences", "projects"],
      ),
    ).toEqual(["projects"]);
  });

  it("round-trips only supported selections through browser storage", () => {
    const encoded = encodeStoredStudioDraft(
      pack,
      ["profile", "experiences"],
      "2026-08-10T00:00:00.000Z",
    );
    expect(encoded).not.toBeNull();
    expect(decodeStoredStudioDraft(encoded)).toEqual({
      storageVersion: 1,
      text: pack,
      selectedSections: ["profile", "experiences"],
      savedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(decodeStoredStudioDraft('{"storageVersion":2}')).toBeNull();
  });

  it("accepts a large pack for preview without forcing it into browser storage", () => {
    const largePack = JSON.stringify({
      version: "portfolio-pack.v1",
      sections: { posts: [{ contentMarkdown: "x".repeat(MAX_STORED_DRAFT_BYTES) }] },
    });
    expect(parsePortfolioPackDraft(largePack).ok).toBe(true);
    expect(encodeStoredStudioDraft(largePack, ["posts"])).toBeNull();
  });

  it("degrades cleanly when browser storage rejects the draft", () => {
    expect(
      tryStoreStudioDraft(
        {
          setItem() {
            throw new Error("QuotaExceededError");
          },
        },
        "draft",
      ),
    ).toBe(false);
  });
});

describe("Launch Studio server response projection", () => {
  it("keeps only safe setup counts from a snapshot", () => {
    expect(
      normalizeSetupSnapshot({
        counts: {
          profile: 1,
          appearance: 1,
          socialLinks: 0,
          focusAreas: 0,
          experiences: 3,
          projects: 0,
          posts: 0,
          knowledgeBases: 0,
        },
        demoExactMatchCounts: {
          profile: 1,
          appearance: 1,
          socialLinks: 0,
          focusAreas: 0,
          experiences: 1,
          projects: 0,
          posts: 0,
          knowledgeBases: 0,
        },
        hasPlaceholders: true,
        hasRealContent: true,
        defaultLocale: "zh",
        recommendedSelection: ["profile", "appearance", "projects"],
        mediaWarningCounts: { localUploads: 1, external: 0, total: 1, truncated: false },
        beforeReadiness: {
          score: 44,
          readyToShare: false,
          counts: { pass: 2, warning: 1, blocker: 3 },
        },
        internalSecret: "must-not-cross",
      }),
    ).toMatchObject({
      hasDemoContent: true,
      totalCount: 5,
      recommendedSelection: ["profile", "appearance", "projects"],
      sections: expect.arrayContaining([
        { key: "profile", count: 1, demoCount: 1, realCount: 0 },
        { key: "socialLinks", count: 0, demoCount: 0, realCount: 0 },
      ]),
    });
  });

  it("fails closed when a preview does not contain recognizable section diffs", () => {
    expect(normalizeReviewPlan({ warnings: [] })).toBeNull();
    expect(normalizeReviewPlan({
      version: "portfolio-pack.v1",
      fingerprint: "not-a-fingerprint",
      sections: planSections,
    })).toBeNull();
    expect(
      normalizeReviewPlan({
        version: "portfolio-pack.v1",
        fingerprint,
        sections: planSections,
        warnings: [{
          code: "existing-content",
          severity: "warning",
          detail: "Existing content will be replaced",
          section: "profile",
        }],
        blockers: [],
        mediaReferences: [],
        mediaReferencesTruncated: false,
        publicationAdjustments: [],
        recommendedSelection: ["profile", "serverSecrets"],
        selectedSections: ["profile"],
      }),
    ).toBeNull();

    expect(
      normalizeReviewPlan({
        version: "portfolio-pack.v1",
        fingerprint,
        sections: planSections,
        warnings: [{
          code: "existing-content",
          severity: "warning",
          detail: "Existing content will be replaced",
          section: "profile",
        }],
        blockers: [],
        mediaReferences: [],
        mediaReferencesTruncated: false,
        publicationAdjustments: [],
        recommendedSelection: ["profile"],
        selectedSections: ["profile"],
      }),
    ).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({ key: "profile", current: 1, incoming: 1, replaced: 1 }),
      ]),
      warnings: ["Existing content will be replaced"],
      recommendedSelection: ["profile"],
    });
  });

  it("accepts only an apply receipt bound to the reviewed fingerprint and selection", () => {
    const receipt = {
      version: "portfolio-pack.v1",
      appliedAt: "2026-08-10T00:00:00.000Z",
      fingerprint,
      selectedSections: ["profile"],
      sections: planSections,
      warnings: [],
      publicationAdjustments: [],
    };

    expect(isValidApplyReceipt(receipt, fingerprint, ["profile"])).toBe(true);
    expect(isValidApplyReceipt(receipt, "b".repeat(64), ["profile"])).toBe(false);
    expect(isValidApplyReceipt({ ...receipt, selectedSections: [] }, fingerprint, ["profile"]))
      .toBe(false);
  });
});
