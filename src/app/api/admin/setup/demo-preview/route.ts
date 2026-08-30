import { requireAdmin } from "@/lib/auth/require-admin";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { previewDemoCleanup } from "@/lib/portfolio-pack/server";
import { loadReadinessInput } from "@/lib/readiness/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const plan = previewDemoCleanup(await loadReadinessInput());
    return privateJson({ ok: true, plan });
  } catch (error) {
    console.error("demo cleanup preview failed", error);
    return privateJson({ error: "无法预览 demo 清理范围。" }, { status: 500 });
  }
}
