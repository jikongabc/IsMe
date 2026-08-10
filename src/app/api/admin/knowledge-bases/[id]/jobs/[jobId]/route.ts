import { NextResponse } from "next/server";
import { cogdocErrorResponse, loadAdminKb, requireAdminOrResponse } from "@/lib/api/admin-cogdoc";
import { getIndexJob } from "@/lib/cogdoc/admin-client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await requireAdminOrResponse();
  if (denied) return denied;

  const { id, jobId } = await params;
  const loaded = await loadAdminKb(id);
  if ("error" in loaded) return loaded.error;

  try {
    const job = await getIndexJob(jobId);
    if (job.kb_id !== loaded.module.cogdocKbId) {
      return NextResponse.json(
        { error: "Job does not belong to this knowledge module", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    return NextResponse.json({
      job: {
        jobId: job.job_id,
        status: job.status,
        message: job.message,
        documentCount: job.document_count,
        chunkCount: job.chunk_count,
        createdAt: job.created_at,
        finishedAt: job.finished_at,
        errorCode: job.error_code ?? null,
      },
    });
  } catch (error) {
    return cogdocErrorResponse(error);
  }
}
