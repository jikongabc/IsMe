import { NextResponse } from "next/server";
import { cogdocErrorResponse, loadAdminKb, requireAdminOrResponse } from "@/lib/api/admin-cogdoc";
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
} from "@/lib/cogdoc/admin-client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const MAX_PDF_BYTES = 40 * 1024 * 1024;

export async function GET(_request: Request, { params }: Params) {
  const denied = await requireAdminOrResponse();
  if (denied) return denied;

  const { id } = await params;
  const loaded = await loadAdminKb(id);
  if ("error" in loaded) return loaded.error;

  try {
    const documents = await listDocuments(loaded.module.cogdocKbId);
    return NextResponse.json({
      moduleSlug: loaded.module.slug,
      documents: documents.map((doc) => ({ name: doc.name, sha256: doc.sha256 })),
    });
  } catch (error) {
    return cogdocErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const denied = await requireAdminOrResponse();
  if (denied) return denied;

  const { id } = await params;
  const loaded = await loadAdminKb(id);
  if ("error" in loaded) return loaded.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing PDF file", code: "BAD_REQUEST" }, { status: 400 });
  }

  const filename = file.name || "upload.pdf";
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only .pdf files are accepted", code: "INVALID_PDF" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF too large (max 40MB)", code: "FILE_TOO_LARGE" }, { status: 413 });
  }

  try {
    const job = await uploadDocument(loaded.module.cogdocKbId, file, filename);
    return NextResponse.json({
      ok: true,
      job: {
        jobId: job.job_id,
        status: job.status,
        message: job.message,
        documentCount: job.document_count,
        chunkCount: job.chunk_count,
        createdAt: job.created_at,
        finishedAt: job.finished_at,
      },
    });
  } catch (error) {
    return cogdocErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const denied = await requireAdminOrResponse();
  if (denied) return denied;

  const { id } = await params;
  const loaded = await loadAdminKb(id);
  if ("error" in loaded) return loaded.error;

  const name = new URL(request.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing document name", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const job = await deleteDocument(loaded.module.cogdocKbId, name);
    return NextResponse.json({
      ok: true,
      job: {
        jobId: job.job_id,
        status: job.status,
        message: job.message,
      },
    });
  } catch (error) {
    return cogdocErrorResponse(error);
  }
}
