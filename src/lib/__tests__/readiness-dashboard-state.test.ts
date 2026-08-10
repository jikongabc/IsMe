import { describe, expect, it } from "vitest";
import {
  canExportReadinessReport,
  resolveReadinessGateState,
} from "@/app/admin/readiness/ReadinessDashboard";
import type { ReadinessReport } from "@/lib/readiness/types";

function report({
  readyToShare,
  blocker = 0,
  linkAuditComplete = true,
}: {
  readyToShare: boolean;
  blocker?: number;
  linkAuditComplete?: boolean;
}): ReadinessReport {
  return {
    generatedAt: "2026-08-10T00:00:00.000Z",
    score: readyToShare ? 100 : 72,
    readyToShare,
    counts: { pass: 1, warning: 0, blocker },
    items: [],
    ...(linkAuditComplete ? { linkChecks: [] } : {}),
  };
}

describe("readiness dashboard fail-closed state", () => {
  it("shows ready only for an idle, successful report", () => {
    const readyReport = report({ readyToShare: true });

    expect(
      resolveReadinessGateState({ busy: null, error: null, report: readyReport }),
    ).toBe("ready");
    expect(
      resolveReadinessGateState({ busy: "refresh", error: null, report: readyReport }),
    ).toBe("checking");
    expect(
      resolveReadinessGateState({ busy: null, error: "request failed", report: readyReport }),
    ).toBe("failed");
  });

  it("keeps verification and content blockers distinct", () => {
    expect(
      resolveReadinessGateState({
        busy: null,
        error: null,
        report: report({ readyToShare: false, linkAuditComplete: false }),
      }),
    ).toBe("verify");
    expect(
      resolveReadinessGateState({
        busy: null,
        error: null,
        report: report({ readyToShare: false, blocker: 2 }),
      }),
    ).toBe("hold");
  });

  it("disables stale report export while checking or after failure", () => {
    expect(canExportReadinessReport(null, null)).toBe(true);
    expect(canExportReadinessReport("links", null)).toBe(false);
    expect(canExportReadinessReport(null, "request failed")).toBe(false);
  });
});
