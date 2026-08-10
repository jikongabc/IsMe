import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/media/storage", () => ({
  describeMediaObject: vi.fn((fileName: string) => ({
    key: fileName,
    name: fileName,
    url: `/uploads/${fileName}`,
    storage: "local",
  })),
}));

import {
  PORTFOLIO_BUNDLE_VERSION,
  PortfolioBundleValidationError,
  preparePortfolioBundle,
  safeParsePortfolioBundle,
  type PortfolioBundleV1,
} from "@/lib/portfolio-bundle";
import { createBlankPortfolioPack } from "@/lib/portfolio-pack";

const timestamp = "2026-08-10T00:00:00.000Z";
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const digest = createHash("sha256").update(png).digest("hex");

function bundle(): PortfolioBundleV1 {
  const pack = createBlankPortfolioPack(timestamp);
  pack.sections.profile.avatarUrl = "/uploads/avatar.png";
  pack.sections.projects.push({
    name: "Proof",
    nameEn: "",
    slug: "proof",
    summary: "",
    summaryEn: "",
    description: "![screen](/uploads/avatar.png)",
    descriptionEn: "",
    contentFormat: "markdown",
    coverUrl: "/uploads/avatar.png",
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
    status: "draft",
  });
  return {
    version: PORTFOLIO_BUNDLE_VERSION,
    exportedAt: timestamp,
    pack,
    assets: [{
      sourceUrl: "/uploads/avatar.png",
      contentType: "image/png",
      bytes: png.length,
      sha256: digest,
      dataBase64: png.toString("base64"),
    }],
  };
}

describe("portfolio-bundle.v1 media contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates bytes and rewrites every selected media use to a stable digest URL", () => {
    const prepared = preparePortfolioBundle({
      bundle: bundle(),
      selection: ["profile", "projects"],
    });
    const destination = `/uploads/bundle-${digest}.png`;
    expect(prepared.pack.sections.profile.avatarUrl).toBe(destination);
    expect(prepared.pack.sections.projects[0]?.coverUrl).toBe(destination);
    expect(prepared.pack.sections.projects[0]?.description).toContain(destination);
    expect(prepared.summary).toMatchObject({
      assetCount: 1,
      importedAssetCount: 1,
      importedBytes: png.length,
      externalReferenceCount: 0,
    });
  });

  it("rejects tampered media instead of trusting declared metadata", () => {
    const value = bundle();
    value.assets[0]!.sha256 = "0".repeat(64);
    expect(() => preparePortfolioBundle({ bundle: value, selection: ["profile"] }))
      .toThrow(PortfolioBundleValidationError);
  });

  it("blocks a selected local upload when its bytes are missing", () => {
    const value = bundle();
    value.assets = [];
    expect(() => preparePortfolioBundle({ bundle: value, selection: ["profile"] }))
      .toThrow(/缺少 1 个/);
  });

  it("does not require or import media belonging only to an unselected section", () => {
    const value = bundle();
    value.assets = [];
    const prepared = preparePortfolioBundle({ bundle: value, selection: ["appearance"] });
    expect(prepared.assets).toEqual([]);
    expect(prepared.pack.sections.profile.avatarUrl).toBe("/uploads/avatar.png");
  });

  it("rejects duplicate source URLs at the schema boundary", () => {
    const value = bundle();
    value.assets.push({ ...value.assets[0]! });
    const parsed = safeParsePortfolioBundle(value);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === "duplicate sourceUrl")).toBe(true);
    }
  });
});
