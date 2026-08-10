import { describe, expect, it } from "vitest";
import {
  demoCleanupRequestSchema,
  portfolioPackImportRequestSchema,
  portfolioPackPreviewRequestSchema,
} from "@/app/api/admin/portfolio-pack/_contract";

const fingerprint = "a".repeat(64);

describe("portfolio pack route envelopes", () => {
  it("requires an explicit pack and a non-empty unique section selection", () => {
    expect(
      portfolioPackPreviewRequestSchema.safeParse({
        pack: { version: "portfolio-pack.v1" },
        sections: ["profile", "experiences"],
      }).success,
    ).toBe(true);
    expect(portfolioPackPreviewRequestSchema.safeParse({ sections: ["profile"] }).success)
      .toBe(false);
    expect(
      portfolioPackPreviewRequestSchema.safeParse({ pack: {}, sections: [] }).success,
    ).toBe(false);
    expect(
      portfolioPackPreviewRequestSchema.safeParse({
        pack: {},
        sections: ["profile", "profile"],
      }).success,
    ).toBe(false);
    expect(
      portfolioPackPreviewRequestSchema.safeParse({
        pack: {},
        sections: ["privateCredentials"],
      }).success,
    ).toBe(false);
  });

  it("requires the exact import phrase and the preview SHA-256 fingerprint", () => {
    const base = {
      pack: { version: "portfolio-pack.v1" },
      sections: ["profile"],
      confirmation: "IMPORT PORTFOLIO PACK",
      planFingerprint: fingerprint,
    };
    expect(portfolioPackImportRequestSchema.safeParse(base).success).toBe(true);
    expect(
      portfolioPackImportRequestSchema.safeParse({ ...base, confirmation: "import" }).success,
    ).toBe(false);
    expect(
      portfolioPackImportRequestSchema.safeParse({ ...base, planFingerprint: "a" }).success,
    ).toBe(false);
    expect(
      portfolioPackImportRequestSchema.safeParse({ ...base, unexpected: true }).success,
    ).toBe(false);
  });

  it("uses a separate exact phrase and fingerprint for demo cleanup", () => {
    expect(
      demoCleanupRequestSchema.safeParse({
        confirmation: "REMOVE DEMO CONTENT",
        planFingerprint: fingerprint,
      }).success,
    ).toBe(true);
    expect(
      demoCleanupRequestSchema.safeParse({
        confirmation: "REMOVE ALL CONTENT",
        planFingerprint: fingerprint,
      }).success,
    ).toBe(false);
    expect(
      demoCleanupRequestSchema.safeParse({ confirmation: "REMOVE DEMO CONTENT" }).success,
    ).toBe(false);
  });
});
