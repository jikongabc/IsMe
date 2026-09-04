import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => null as Response | null),
  tryAuditRequest: vi.fn(),
  getReadinessReport: vi.fn(),
  loadReadinessInput: vi.fn(),
  buildReadinessReport: vi.fn(),
  collectReadinessLinks: vi.fn(),
  applyKnowledgeHealth: vi.fn(),
  applyLinkChecks: vi.fn(),
  auditReadinessLinks: vi.fn(),
  checkCogDocReadiness: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/audit/log", () => ({
  tryAuditRequest: mocks.tryAuditRequest,
}));
vi.mock("@/lib/readiness/server", () => ({
  getReadinessReport: mocks.getReadinessReport,
  loadReadinessInput: mocks.loadReadinessInput,
}));
vi.mock("@/lib/readiness/report", () => ({
  buildReadinessReport: mocks.buildReadinessReport,
  collectReadinessLinks: mocks.collectReadinessLinks,
  applyKnowledgeHealth: mocks.applyKnowledgeHealth,
  applyLinkChecks: mocks.applyLinkChecks,
}));
vi.mock("@/lib/readiness/link-audit", () => ({
  auditReadinessLinks: mocks.auditReadinessLinks,
}));
vi.mock("@/lib/cogdoc/admin-client", () => ({
  checkCogDocReadiness: mocks.checkCogDocReadiness,
}));

import { GET, POST } from "@/app/api/admin/readiness/route";

const baseReport = {
  generatedAt: "2026-08-10T00:00:00.000Z",
  score: 64,
  readyToShare: false,
  counts: { pass: 2, warning: 1, blocker: 1 },
  items: [
    {
      id: "identity-placeholder",
      category: "identity" as const,
      status: "blocker" as const,
      title: "仍有模板身份",
      detail: "请替换示例姓名。",
      weight: 5,
    },
  ],
};

describe("admin readiness route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.getReadinessReport.mockResolvedValue(baseReport);
    mocks.loadReadinessInput.mockResolvedValue({
      marker: "input",
      knowledgeBases: [{ enabled: true, cogdocKbId: "career-knowledge" }],
      env: { cogdocApiUrlConfigured: true, cogdocApiKeyConfigured: true },
    });
    mocks.buildReadinessReport.mockReturnValue(baseReport);
    mocks.collectReadinessLinks.mockReturnValue([
      { url: "https://portfolio.example/project", label: "Demo", source: "project" },
    ]);
    mocks.auditReadinessLinks.mockResolvedValue([
      {
        url: "https://portfolio.example/project",
        label: "Demo",
        source: "project",
        status: "ok",
        httpStatus: 200,
      },
    ]);
    mocks.checkCogDocReadiness.mockResolvedValue({
      ok: true,
      status: 200,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: 0,
    });
    mocks.applyKnowledgeHealth.mockImplementation((report) => report);
    mocks.applyLinkChecks.mockImplementation((report, checks, totalTargetCount) => ({
      ...report,
      linkChecks: checks,
      linkTargetCount: totalTargetCount,
    }));
  });

  it("rechecks authentication and returns a private no-store local report", async () => {
    const result = await GET();

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(await result.json()).toEqual(baseReport);
    expect(mocks.getReadinessReport).toHaveBeenCalledTimes(1);
    expect(mocks.auditReadinessLinks).not.toHaveBeenCalled();
  });

  it("short-circuits both methods when the session is not authorized", async () => {
    const denied = Response.json({ error: "Unauthorized" }, { status: 401 });
    mocks.requireAdmin.mockResolvedValue(denied);

    expect(await GET()).toBe(denied);
    expect(
      await POST(new Request("http://localhost/api/admin/readiness", { method: "POST" })),
    ).toBe(denied);
    expect(mocks.getReadinessReport).not.toHaveBeenCalled();
    expect(mocks.auditReadinessLinks).not.toHaveBeenCalled();
  });

  it("runs the bounded link audit only on POST and records aggregate results", async () => {
    const request = new Request("http://localhost/api/admin/readiness", { method: "POST" });
    const result = await POST(request);
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(mocks.collectReadinessLinks).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "input" }),
    );
    expect(mocks.auditReadinessLinks).toHaveBeenCalledTimes(1);
    expect(mocks.checkCogDocReadiness).toHaveBeenCalledWith(["career-knowledge"]);
    expect(mocks.applyKnowledgeHealth).toHaveBeenCalledWith(baseReport, {
      ok: true,
      status: 200,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: 0,
    });
    expect(body.linkChecks).toEqual([
      expect.objectContaining({ status: "ok", httpStatus: 200 }),
    ]);
    expect(mocks.tryAuditRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        action: "readiness.links.check",
        detail: { total: 1, targets: 1, ok: 1, failed: 0, blocked: 0, skipped: 0 },
      }),
    );
  });

  it("passes the full discovered count to the report when the audit is bounded", async () => {
    const targets = Array.from({ length: 42 }, (_, index) => ({
      url: `https://portfolio.example/${index}`,
      label: `Target ${index}`,
      source: `body:${index}`,
    }));
    mocks.collectReadinessLinks.mockReturnValueOnce(targets);
    mocks.auditReadinessLinks.mockResolvedValueOnce(
      targets.slice(0, 40).map((target) => ({ ...target, status: "ok" })),
    );

    await POST(new Request("http://localhost/api/admin/readiness", { method: "POST" }));

    expect(mocks.applyLinkChecks).toHaveBeenCalledWith(
      baseReport,
      expect.any(Array),
      42,
    );
    expect(mocks.tryAuditRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        detail: expect.objectContaining({ total: 40, targets: 42 }),
      }),
    );
  });

  it("projects CogDoc failures to a safe health summary before applying link results", async () => {
    mocks.checkCogDocReadiness.mockResolvedValueOnce({
      ok: false,
      status: 503,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: 1,
      detail: "http://cogdoc.internal:8000 leaked transport detail",
    });

    const result = await POST(
      new Request("http://localhost/api/admin/readiness", { method: "POST" }),
    );

    expect(result.status).toBe(200);
    expect(mocks.applyKnowledgeHealth).toHaveBeenCalledWith(baseReport, {
      ok: false,
      status: 503,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: 1,
    });
    expect(JSON.stringify(mocks.applyKnowledgeHealth.mock.calls)).not.toContain(
      "cogdoc.internal",
    );
  });

  it("does not probe CogDoc when no public knowledge module is enabled", async () => {
    mocks.loadReadinessInput.mockResolvedValueOnce({
      marker: "input",
      knowledgeBases: [{ enabled: false }],
      env: { cogdocApiUrlConfigured: true, cogdocApiKeyConfigured: true },
    });

    const result = await POST(
      new Request("http://localhost/api/admin/readiness", { method: "POST" }),
    );

    expect(result.status).toBe(200);
    expect(mocks.checkCogDocReadiness).not.toHaveBeenCalled();
    expect(mocks.applyKnowledgeHealth).not.toHaveBeenCalled();
  });

  it("coalesces concurrent outbound scans into one network job", async () => {
    let resolveAudit!: (value: Array<Record<string, unknown>>) => void;
    mocks.auditReadinessLinks.mockReturnValue(
      new Promise((resolve) => {
        resolveAudit = resolve;
      }),
    );

    const first = POST(
      new Request("http://localhost/api/admin/readiness", { method: "POST" }),
    );
    const second = POST(
      new Request("http://localhost/api/admin/readiness", { method: "POST" }),
    );

    await vi.waitFor(() => expect(mocks.auditReadinessLinks).toHaveBeenCalledTimes(1));
    resolveAudit([]);
    const results = await Promise.all([first, second]);

    expect(results.map((item) => item.status)).toEqual([200, 200]);
    expect(mocks.loadReadinessInput).toHaveBeenCalledTimes(1);
  });

  it("does not expose internal failures", async () => {
    mocks.getReadinessReport.mockRejectedValueOnce(
      new Error("SESSION_SECRET=do-not-leak"),
    );

    const result = await GET();
    const body = await result.json();

    expect(result.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("do-not-leak");
  });
});
