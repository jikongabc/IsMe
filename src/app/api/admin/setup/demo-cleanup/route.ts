import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { parseJsonBody } from "@/lib/http/parse-json";
import {
  applyPortfolioPack,
  createSafeDemoCleanupCandidate,
  demoCleanupSelection,
  PortfolioPackConflictError,
  readCurrentPortfolioPack,
} from "@/lib/portfolio-pack/server";
import { getReadinessReport } from "@/lib/readiness/server";
import {
  PORTFOLIO_PACK_REQUEST_MAX_BYTES,
  demoCleanupRequestSchema,
} from "../../portfolio-pack/_contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await parseJsonBody(request, {
    maxBytes: PORTFOLIO_PACK_REQUEST_MAX_BYTES,
    requireJsonContentType: true,
  });
  if (!body.ok) return body.response;
  const envelope = demoCleanupRequestSchema.safeParse(body.data);
  if (!envelope.success) {
    return privateJson({ error: "Demo 清理确认或预览指纹无效。" }, { status: 400 });
  }

  try {
    const current = readCurrentPortfolioPack();
    const { candidate } = createSafeDemoCleanupCandidate(current);
    const selection = demoCleanupSelection(current, candidate);
    if (selection.length === 0) {
      return privateJson(
        { error: "没有可安全批量移除的精确 demo 内容。", code: "NO_DEMO_CHANGES" },
        { status: 409 },
      );
    }
    const result = applyPortfolioPack({
      incoming: candidate,
      selection,
      expectedFingerprint: envelope.data.planFingerprint,
    });
    const syncQueued = result.selectedSections.some((section) => section !== "appearance");
    if (syncQueued) tryAutoSyncSiteContent();

    let report = null;
    try {
      report = await getReadinessReport();
      result.readiness = {
        score: report.score,
        readyToShare: report.readyToShare,
        counts: report.counts,
      };
    } catch {
      // Cleanup is already committed; readiness can be retried from its page.
    }
    tryAuditRequest(request, {
      action: "portfolio_pack.demo_cleanup",
      target: result.fingerprint,
      detail: { sections: result.selectedSections, syncQueued },
    });
    return privateJson({ ok: true, result, report, syncQueued });
  } catch (error) {
    if (error instanceof PortfolioPackConflictError) {
      return privateJson(
        { error: "站点内容已变化，请重新预览清理范围。", code: "STALE_PREVIEW" },
        { status: 409 },
      );
    }
    console.error("demo cleanup failed", error);
    tryAuditRequest(request, {
      action: "portfolio_pack.demo_cleanup",
      target: envelope.data.planFingerprint,
      ok: false,
    });
    return privateJson({ error: "Demo 内容没有被清理。" }, { status: 500 });
  }
}
