import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkCogDocReadiness } from "@/lib/cogdoc/admin-client";
import { auditReadinessLinks } from "@/lib/readiness/link-audit";
import {
  applyKnowledgeHealth,
  applyLinkChecks,
  buildReadinessReport,
  collectReadinessLinks,
} from "@/lib/readiness/report";
import {
  getReadinessReport,
  loadReadinessInput,
} from "@/lib/readiness/server";
import type { ReadinessReport } from "@/lib/readiness/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

let activeLinkAudit: Promise<ReadinessReport> | null = null;

function response(report: ReadinessReport) {
  return NextResponse.json(report, { headers: PRIVATE_NO_STORE_HEADERS });
}

function failure() {
  return NextResponse.json(
    { error: "发布体检暂时无法完成，请稍后重试。" },
    { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

async function buildReportWithLinkAudit(): Promise<ReadinessReport> {
  const input = await loadReadinessInput();
  const report = buildReadinessReport(input);
  const targets = collectReadinessLinks(input);
  const shouldCheckCogDoc =
    input.knowledgeBases.some((knowledgeBase) => knowledgeBase.enabled) &&
    input.env.cogdocApiUrlConfigured &&
    input.env.cogdocApiKeyConfigured;
  const [linkChecks, cogdocHealth] = await Promise.all([
    auditReadinessLinks(targets),
    shouldCheckCogDoc
      ? checkCogDocReadiness(
          input.knowledgeBases
            .filter((knowledgeBase) => knowledgeBase.enabled)
            .map((knowledgeBase) => knowledgeBase.cogdocKbId),
        )
      : Promise.resolve(null),
  ]);
  const reportWithHealth = cogdocHealth
    ? applyKnowledgeHealth(report, {
        ok: cogdocHealth.ok,
        status: cogdocHealth.status,
        missingCount: cogdocHealth.missingCount,
        emptyCount: cogdocHealth.emptyCount,
        unverifiedCount: cogdocHealth.unverifiedCount,
      })
    : report;
  return applyLinkChecks(reportWithHealth, linkChecks, targets.length);
}

function runCoalescedLinkAudit(): Promise<ReadinessReport> {
  if (!activeLinkAudit) {
    activeLinkAudit = buildReportWithLinkAudit().finally(() => {
      activeLinkAudit = null;
    });
  }
  return activeLinkAudit;
}

/** Rebuild the local, read-only launch report without making network requests. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    return response(await getReadinessReport());
  } catch {
    return failure();
  }
}

/** Explicitly trigger the bounded, SSRF-safe external link audit. */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const report = await runCoalescedLinkAudit();
    const checks = report.linkChecks ?? [];
    tryAuditRequest(request, {
      action: "readiness.links.check",
      target: "public-content",
      detail: {
        total: checks.length,
        targets: report.linkTargetCount ?? checks.length,
        ok: checks.filter((item) => item.status === "ok").length,
        failed: checks.filter((item) => item.status === "failed").length,
        blocked: checks.filter((item) => item.status === "blocked").length,
        skipped: checks.filter((item) => item.status === "skipped").length,
      },
    });
    return response(report);
  } catch {
    tryAuditRequest(request, {
      action: "readiness.links.check",
      target: "public-content",
      ok: false,
    });
    return failure();
  }
}
