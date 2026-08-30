import { NextResponse } from "next/server";
import { cogdocErrorResponse, loadAdminKb } from "@/lib/api/admin-cogdoc";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ensureKnowledgeBase } from "@/lib/cogdoc/admin-client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const loaded = await loadAdminKb(id);
  if ("error" in loaded) return loaded.error;

  try {
    const result = await ensureKnowledgeBase(loaded.module.cogdocKbId);
    return NextResponse.json({
      ok: true,
      created: result.created,
      kb: {
        kbId: result.kb.kb_id,
        documentCount: result.kb.document_count,
        createdAt: result.kb.created_at,
      },
      moduleSlug: loaded.module.slug,
    });
  } catch (error) {
    return cogdocErrorResponse(error);
  }
}
