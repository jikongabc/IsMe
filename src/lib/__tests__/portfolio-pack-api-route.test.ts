import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => {
  class ConflictError extends Error {}
  return {
    ConflictError,
    requireAdmin: vi.fn<() => Promise<NextResponse | null>>(async () => null),
    readCurrentPortfolioPack: vi.fn(),
    previewPortfolioPack: vi.fn(),
    applyPortfolioPack: vi.fn(),
    getReadinessReport: vi.fn(),
    tryAutoSyncSiteContent: vi.fn(),
    tryAuditRequest: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/portfolio-pack/server", () => ({
  PortfolioPackConflictError: mocks.ConflictError,
  readCurrentPortfolioPack: mocks.readCurrentPortfolioPack,
  previewPortfolioPack: mocks.previewPortfolioPack,
  applyPortfolioPack: mocks.applyPortfolioPack,
}));
vi.mock("@/lib/readiness/server", () => ({
  loadReadinessInput: vi.fn(async () => ({ env: {} })),
  getReadinessReport: mocks.getReadinessReport,
}));
vi.mock("@/lib/content/sync-to-cogdoc", () => ({
  tryAutoSyncSiteContent: mocks.tryAutoSyncSiteContent,
}));
vi.mock("@/lib/audit/log", () => ({ tryAuditRequest: mocks.tryAuditRequest }));

import { createBlankPortfolioPack, PORTFOLIO_PACK_SECTIONS } from "@/lib/portfolio-pack";
import { GET as exportPack } from "@/app/api/admin/portfolio-pack/route";
import { POST as previewPack } from "@/app/api/admin/portfolio-pack/preview/route";
import { POST as importPack } from "@/app/api/admin/portfolio-pack/import/route";

const fingerprint = "a".repeat(64);
const timestamp = "2026-08-10T00:00:00.000Z";

function request(path: string, body: unknown, origin = "https://portfolio.example") {
  return new Request(`https://portfolio.example${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      accept: "application/json",
    },
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
  };
}

function result() {
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

describe("portfolio pack admin route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const pack = createBlankPortfolioPack(timestamp);
    mocks.readCurrentPortfolioPack.mockReturnValue(pack);
    mocks.previewPortfolioPack.mockReturnValue(plan());
    mocks.applyPortfolioPack.mockReturnValue(result());
    mocks.getReadinessReport.mockResolvedValue({
      generatedAt: timestamp,
      score: 40,
      readyToShare: false,
      counts: { pass: 1, warning: 2, blocker: 3 },
      items: [],
    });
  });

  it("exports an authenticated private attachment and short-circuits unauthorized reads", async () => {
    const response = await exportPack();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("portfolio-pack-2026-08-10.json");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");

    mocks.requireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const denied = await exportPack();
    expect(denied.status).toBe(401);
    expect(mocks.readCurrentPortfolioPack).toHaveBeenCalledTimes(1);
  });

  it("requires exact same-origin before generating a read-only preview", async () => {
    const pack = createBlankPortfolioPack(timestamp);
    const denied = await previewPack(request(
      "/api/admin/portfolio-pack/preview",
      { pack, sections: ["profile"] },
      "https://attacker.example",
    ));
    expect(denied.status).toBe(403);
    expect(mocks.previewPortfolioPack).not.toHaveBeenCalled();

    const response = await previewPack(request(
      "/api/admin/portfolio-pack/preview",
      { pack, sections: ["profile"] },
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.previewPortfolioPack).toHaveBeenCalledTimes(1);
  });

  it("commits a valid import once, queues sync, and returns a filtered report", async () => {
    const pack = createBlankPortfolioPack(timestamp);
    const response = await importPack(request("/api/admin/portfolio-pack/import", {
      pack,
      sections: ["profile"],
      confirmation: "IMPORT PORTFOLIO PACK",
      planFingerprint: fingerprint,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, syncQueued: true });
    expect(mocks.applyPortfolioPack).toHaveBeenCalledTimes(1);
    expect(mocks.tryAutoSyncSiteContent).toHaveBeenCalledTimes(1);
    expect(mocks.tryAuditRequest).toHaveBeenCalledTimes(1);
    expect(PORTFOLIO_PACK_SECTIONS).toContain("profile");
  });

  it("returns a sanitized 409 and performs no sync for a stale preview", async () => {
    mocks.applyPortfolioPack.mockImplementationOnce(() => {
      throw new mocks.ConflictError("private conflict detail");
    });
    const pack = createBlankPortfolioPack(timestamp);
    const response = await importPack(request("/api/admin/portfolio-pack/import", {
      pack,
      sections: ["profile"],
      confirmation: "IMPORT PORTFOLIO PACK",
      planFingerprint: fingerprint,
    }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      error: "站点内容已变化，请重新生成预览。",
      code: "STALE_PREVIEW",
    });
    expect(JSON.stringify(payload)).not.toContain("private conflict detail");
    expect(mocks.tryAutoSyncSiteContent).not.toHaveBeenCalled();
    expect(mocks.tryAuditRequest).not.toHaveBeenCalled();
  });
});
