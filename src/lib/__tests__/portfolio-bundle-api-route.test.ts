import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => {
  class ConflictError extends Error {}
  class ValidationError extends Error {}
  return {
    ConflictError,
    ValidationError,
    requireAdmin: vi.fn<() => Promise<NextResponse | null>>(async () => null),
    createPortfolioBundle: vi.fn(),
    previewPortfolioBundle: vi.fn(),
    applyPortfolioBundle: vi.fn(),
    getReadinessReport: vi.fn(),
    tryAutoSyncSiteContent: vi.fn(),
    tryAuditRequest: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/portfolio-bundle/server", () => ({
  PortfolioBundleExportError: mocks.ValidationError,
  PortfolioBundleValidationError: mocks.ValidationError,
  createPortfolioBundle: mocks.createPortfolioBundle,
  previewPortfolioBundle: mocks.previewPortfolioBundle,
  applyPortfolioBundle: mocks.applyPortfolioBundle,
}));
vi.mock("@/lib/portfolio-pack/server", () => ({
  PortfolioPackConflictError: mocks.ConflictError,
}));
vi.mock("@/lib/readiness/server", () => ({
  loadReadinessInput: vi.fn(async () => ({ env: {} })),
  getReadinessReport: mocks.getReadinessReport,
}));
vi.mock("@/lib/content/sync-to-cogdoc", () => ({
  tryAutoSyncSiteContent: mocks.tryAutoSyncSiteContent,
}));
vi.mock("@/lib/audit/log", () => ({ tryAuditRequest: mocks.tryAuditRequest }));

import { createBlankPortfolioPack } from "@/lib/portfolio-pack";
import { PORTFOLIO_BUNDLE_VERSION } from "@/lib/portfolio-bundle";
import { GET as exportBundle } from "@/app/api/admin/portfolio-bundle/route";
import { POST as previewBundle } from "@/app/api/admin/portfolio-bundle/preview/route";
import { POST as importBundle } from "@/app/api/admin/portfolio-bundle/import/route";

const timestamp = "2026-08-10T00:00:00.000Z";
const fingerprint = "b".repeat(64);

function bundle() {
  return {
    version: PORTFOLIO_BUNDLE_VERSION,
    exportedAt: timestamp,
    pack: createBlankPortfolioPack(timestamp),
    assets: [],
  };
}

function request(path: string, body: unknown, origin = "https://portfolio.example") {
  return new Request(`https://portfolio.example${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
}

function plan() {
  return {
    version: "portfolio-pack.v1",
    fingerprint,
    sections: [],
    warnings: [],
    blockers: [],
    mediaReferences: [],
    mediaReferencesTruncated: false,
    publicationAdjustments: [],
    recommendedSelection: [],
    selectedSections: ["profile"],
    bundle: {
      assetCount: 0,
      totalBytes: 0,
      importedAssetCount: 0,
      importedBytes: 0,
      externalReferenceCount: 0,
    },
  };
}

function receipt() {
  return {
    version: "portfolio-pack.v1",
    appliedAt: timestamp,
    fingerprint,
    selectedSections: ["profile"],
    sections: [],
    warnings: [],
    publicationAdjustments: [],
  };
}

describe("portfolio bundle admin route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPortfolioBundle.mockResolvedValue(bundle());
    mocks.previewPortfolioBundle.mockReturnValue(plan());
    mocks.applyPortfolioBundle.mockResolvedValue({ result: receipt(), bundle: plan().bundle });
    mocks.getReadinessReport.mockResolvedValue({
      generatedAt: timestamp,
      score: 50,
      readyToShare: false,
      counts: { pass: 1, warning: 1, blocker: 1 },
      items: [],
    });
  });

  it("exports a private attachment and authenticates before reading media", async () => {
    const response = await exportBundle();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(".isme.json");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).version).toBe(PORTFOLIO_BUNDLE_VERSION);

    mocks.requireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const denied = await exportBundle();
    expect(denied.status).toBe(401);
    expect(mocks.createPortfolioBundle).toHaveBeenCalledTimes(1);
  });

  it("requires exact same-origin before decoding a large preview body", async () => {
    const denied = await previewBundle(request(
      "/api/admin/portfolio-bundle/preview",
      { bundle: bundle(), sections: ["profile"] },
      "https://attacker.example",
    ));
    expect(denied.status).toBe(403);
    expect(mocks.previewPortfolioBundle).not.toHaveBeenCalled();

    const response = await previewBundle(request(
      "/api/admin/portfolio-bundle/preview",
      { bundle: bundle(), sections: ["profile"] },
    ));
    expect(response.status).toBe(200);
    expect((await response.json()).plan.bundle.assetCount).toBe(0);
  });

  it("maps media validation failures to 422 without applying content", async () => {
    mocks.previewPortfolioBundle.mockImplementationOnce(() => {
      throw new mocks.ValidationError("媒体数据与 SHA-256 摘要不一致。");
    });
    const response = await previewBundle(request(
      "/api/admin/portfolio-bundle/preview",
      { bundle: bundle(), sections: ["profile"] },
    ));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("SHA-256");
    expect(mocks.applyPortfolioBundle).not.toHaveBeenCalled();
  });

  it("returns a stale conflict without auditing success or queuing sync", async () => {
    mocks.applyPortfolioBundle.mockRejectedValueOnce(new mocks.ConflictError());
    const response = await importBundle(request(
      "/api/admin/portfolio-bundle/import",
      {
        bundle: bundle(),
        sections: ["profile"],
        confirmation: "IMPORT PORTFOLIO BUNDLE",
        planFingerprint: fingerprint,
      },
    ));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("STALE_PREVIEW");
    expect(mocks.tryAuditRequest).not.toHaveBeenCalled();
    expect(mocks.tryAutoSyncSiteContent).not.toHaveBeenCalled();
  });

  it("returns the media receipt and audits one successful import", async () => {
    const response = await importBundle(request(
      "/api/admin/portfolio-bundle/import",
      {
        bundle: bundle(),
        sections: ["profile"],
        confirmation: "IMPORT PORTFOLIO BUNDLE",
        planFingerprint: fingerprint,
      },
    ));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.bundle.importedAssetCount).toBe(0);
    expect(payload.syncQueued).toBe(true);
    expect(mocks.tryAutoSyncSiteContent).toHaveBeenCalledOnce();
    expect(mocks.tryAuditRequest).toHaveBeenCalledOnce();
  });
});
