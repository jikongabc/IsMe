import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { cogdocErrorResponse, loadAdminKb } from "@/lib/api/admin-cogdoc";
import { requireAdmin } from "@/lib/auth/require-admin";
import { syncSiteContentToCogDoc } from "@/lib/content/sync-to-cogdoc";
import { isCogDocConfigured } from "@/lib/env";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  // Allow demo sync even without CogDoc URL so UI can be exercised.
  if (!isCogDocConfigured()) {
    const { getAdminKnowledgeBaseById } = await import("@/lib/content/queries");
    const kbModule = await getAdminKnowledgeBaseById(id);
    if (!kbModule) {
      return NextResponse.json({ error: "Knowledge module not found" }, { status: 404 });
    }
    if (!kbModule.cogdocKbId) {
      return NextResponse.json(
        { error: "Bind a CogDoc KB ID before syncing content", code: "KB_NOT_BOUND" },
        { status: 400 },
      );
    }
    try {
      const result = await syncSiteContentToCogDoc(kbModule.cogdocKbId);
      tryAuditRequest(request, {
        action: "kb.sync_content",
        target: id,
        detail: { slug: kbModule.slug, demo: true, total: result.total },
      });
      return NextResponse.json({ ok: true, result, moduleSlug: kbModule.slug });
    } catch (error) {
      return cogdocErrorResponse(error);
    }
  }

  const loaded = await loadAdminKb(id);
  if ("error" in loaded) return loaded.error;

  try {
    const result = await syncSiteContentToCogDoc(loaded.module.cogdocKbId);
    tryAuditRequest(request, {
      action: "kb.sync_content",
      target: id,
      detail: { slug: loaded.module.slug, demo: false, total: result.total },
    });
    return NextResponse.json({
      ok: true,
      result,
      moduleSlug: loaded.module.slug,
    });
  } catch (error) {
    return cogdocErrorResponse(error);
  }
}
