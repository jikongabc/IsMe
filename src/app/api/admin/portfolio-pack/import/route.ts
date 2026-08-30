import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { parseJsonBody } from "@/lib/http/parse-json";
import { safeParsePortfolioPack } from "@/lib/portfolio-pack";
import {
  applyPortfolioPack,
  PortfolioPackConflictError,
} from "@/lib/portfolio-pack/server";
import { getReadinessReport } from "@/lib/readiness/server";
import {
  PORTFOLIO_PACK_REQUEST_MAX_BYTES,
  portfolioPackImportRequestSchema,
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

function validationMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "pack"}: ${issue.message}`)
    .join("；");
}

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
  const envelope = portfolioPackImportRequestSchema.safeParse(body.data);
  if (!envelope.success) {
    return privateJson({ error: "导入确认、栏目或预览指纹无效。" }, { status: 400 });
  }
  const parsedPack = safeParsePortfolioPack(envelope.data.pack);
  if (!parsedPack.success) {
    return privateJson(
      { error: `内容包校验失败：${validationMessage(parsedPack.error)}` },
      { status: 422 },
    );
  }

  try {
    const result = applyPortfolioPack({
      incoming: parsedPack.data,
      selection: envelope.data.sections,
      expectedFingerprint: envelope.data.planFingerprint,
    });
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
      // The committed import remains successful when the optional report fails.
    }
    tryAuditRequest(request, {
      action: "portfolio_pack.import",
      target: result.fingerprint,
      detail: {
        sections: result.selectedSections,
        warnings: result.warnings.length,
        publicationAdjustments: result.publicationAdjustments.length,
        syncQueued,
      },
    });
    return privateJson({ ok: true, result, report, syncQueued });
  } catch (error) {
    if (error instanceof PortfolioPackConflictError) {
      return privateJson(
        { error: "站点内容已变化，请重新生成预览。", code: "STALE_PREVIEW" },
        { status: 409 },
      );
    }
    console.error("portfolio pack import failed", error);
    tryAuditRequest(request, {
      action: "portfolio_pack.import",
      target: envelope.data.planFingerprint,
      ok: false,
      detail: { sections: envelope.data.sections },
    });
    return privateJson({ error: "内容包未能应用；数据库没有完成这次替换。" }, { status: 500 });
  }
}
