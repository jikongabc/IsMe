import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { parseJsonBody } from "@/lib/http/parse-json";
import {
  applyPortfolioBundle,
  PortfolioBundleValidationError,
} from "@/lib/portfolio-bundle/server";
import { PortfolioPackConflictError } from "@/lib/portfolio-pack/server";
import { getReadinessReport } from "@/lib/readiness/server";
import {
  PORTFOLIO_BUNDLE_REQUEST_MAX_BYTES,
  portfolioBundleImportRequestSchema,
} from "../_contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNCED_SECTIONS = new Set([
  "profile",
  "socialLinks",
  "focusAreas",
  "experiences",
  "projects",
  "posts",
]);

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return privateJson({ error: "Unauthorized" }, { status: 401 });
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;

  const body = await parseJsonBody(request, {
    maxBytes: PORTFOLIO_BUNDLE_REQUEST_MAX_BYTES,
    requireJsonContentType: true,
  });
  if (!body.ok) return body.response;
  const envelope = portfolioBundleImportRequestSchema.safeParse(body.data);
  if (!envelope.success) {
    return privateJson({ error: "导入确认、栏目或预览指纹无效。" }, { status: 400 });
  }

  try {
    const applied = await applyPortfolioBundle({
      bundle: envelope.data.bundle,
      selection: envelope.data.sections,
      expectedFingerprint: envelope.data.planFingerprint,
    });
    const result = applied.result;
    const syncQueued = result.selectedSections.some((section) => SYNCED_SECTIONS.has(section));
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
      // Media and content are already durable; readiness is an optional follow-up.
    }
    tryAuditRequest(request, {
      action: "portfolio_bundle.import",
      target: result.fingerprint,
      detail: {
        sections: result.selectedSections,
        assets: applied.bundle.importedAssetCount,
        bytes: applied.bundle.importedBytes,
        syncQueued,
      },
    });
    return privateJson({
      ok: true,
      result,
      bundle: applied.bundle,
      report,
      syncQueued,
    });
  } catch (error) {
    if (error instanceof PortfolioPackConflictError) {
      return privateJson(
        { error: "站点内容已变化，请重新生成预览。", code: "STALE_PREVIEW" },
        { status: 409 },
      );
    }
    if (error instanceof PortfolioBundleValidationError) {
      return privateJson({ error: error.message }, { status: 422 });
    }
    console.error("portfolio bundle import failed", error);
    tryAuditRequest(request, {
      action: "portfolio_bundle.import",
      target: envelope.data.planFingerprint,
      ok: false,
      detail: { sections: envelope.data.sections },
    });
    return privateJson(
      { error: "站点包未能应用；数据库内容未提交，并已尽力回收本次新建媒体。" },
      { status: 500 },
    );
  }
}
