import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveUploadName } from "@/lib/media/keys";
import { deleteUpload, listUploads } from "@/lib/media/uploads";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listUploads() });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  const safeName = resolveUploadName(name);
  try {
    const ok = await deleteUpload(name);
    if (!ok) {
      return NextResponse.json(
        { error: "File not found or invalid name" },
        { status: 404 },
      );
    }
    tryAuditRequest(request, { action: "media.delete", target: safeName ?? "invalid" });
    return NextResponse.json({ ok: true });
  } catch {
    tryAuditRequest(request, {
      action: "media.delete_failed",
      target: safeName ?? "invalid",
      ok: false,
      detail: { operation: "storage_delete" },
    });
    return NextResponse.json(
      { error: "Unable to delete file", code: "MEDIA_DELETE_FAILED" },
      { status: 503 },
    );
  }
}
