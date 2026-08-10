import { requireAdmin } from "@/lib/auth/require-admin";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { parseJsonBody } from "@/lib/http/parse-json";
import {
  PortfolioBundleValidationError,
  previewPortfolioBundle,
} from "@/lib/portfolio-bundle/server";
import { loadReadinessInput } from "@/lib/readiness/server";
import {
  PORTFOLIO_BUNDLE_REQUEST_MAX_BYTES,
  portfolioBundlePreviewRequestSchema,
} from "../_contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const envelope = portfolioBundlePreviewRequestSchema.safeParse(body.data);
  if (!envelope.success) {
    return privateJson({ error: "站点包预览请求格式无效。" }, { status: 400 });
  }
  try {
    const plan = previewPortfolioBundle(
      envelope.data.bundle,
      envelope.data.sections,
      await loadReadinessInput(),
    );
    return privateJson({ ok: true, plan });
  } catch (error) {
    if (error instanceof PortfolioBundleValidationError) {
      return privateJson({ error: error.message }, { status: 422 });
    }
    console.error("portfolio bundle preview failed", error);
    return privateJson({ error: "服务端无法生成站点包预览。" }, { status: 500 });
  }
}
