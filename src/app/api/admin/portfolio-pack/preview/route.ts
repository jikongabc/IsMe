import { requireAdmin } from "@/lib/auth/require-admin";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { parseJsonBody } from "@/lib/http/parse-json";
import { safeParsePortfolioPack } from "@/lib/portfolio-pack";
import { previewPortfolioPack } from "@/lib/portfolio-pack/server";
import { loadReadinessInput } from "@/lib/readiness/server";
import {
  PORTFOLIO_PACK_REQUEST_MAX_BYTES,
  portfolioPackPreviewRequestSchema,
} from "../_contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validationMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "pack"}: ${issue.message}`)
    .join("；");
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return privateJson({ error: "Unauthorized" }, { status: 401 });
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;

  const body = await parseJsonBody(request, {
    maxBytes: PORTFOLIO_PACK_REQUEST_MAX_BYTES,
    requireJsonContentType: true,
  });
  if (!body.ok) return body.response;
  const envelope = portfolioPackPreviewRequestSchema.safeParse(body.data);
  if (!envelope.success) {
    return privateJson({ error: "导入预览请求格式无效。" }, { status: 400 });
  }
  const parsedPack = safeParsePortfolioPack(envelope.data.pack);
  if (!parsedPack.success) {
    return privateJson(
      { error: `内容包校验失败：${validationMessage(parsedPack.error)}` },
      { status: 422 },
    );
  }

  try {
    const plan = previewPortfolioPack(
      parsedPack.data,
      envelope.data.sections,
      await loadReadinessInput(),
    );
    return privateJson({ ok: true, plan });
  } catch (error) {
    console.error("portfolio pack preview failed", error);
    return privateJson({ error: "服务端无法生成导入预览。" }, { status: 500 });
  }
}
