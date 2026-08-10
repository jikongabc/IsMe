import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteUpload, listUploads } from "@/lib/media/uploads";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listUploads() });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  const ok = await deleteUpload(name);
  if (!ok) return NextResponse.json({ error: "File not found or invalid name" }, { status: 404 });
  tryAuditRequest(request, { action: "media.delete", target: name });
  return NextResponse.json({ ok: true });
}
