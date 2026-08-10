import { NextResponse } from "next/server";
import { cogdocErrorResponse, loadAdminKb, requireAdminOrResponse } from "@/lib/api/admin-cogdoc";
import { ensureKnowledgeBase } from "@/lib/cogdoc/admin-client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const denied = await requireAdminOrResponse();
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
