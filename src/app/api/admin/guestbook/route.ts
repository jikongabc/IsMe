import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  deleteGuestbookMessage,
  listAdminGuestbook,
  setGuestbookStatus,
} from "@/lib/guestbook/store";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: listAdminGuestbook() });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim();
  const status = body.status;
  if (!id || !["pending", "approved", "rejected"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ok = setGuestbookStatus(id, status as "pending" | "approved" | "rejected");
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  tryAuditRequest(request, { action: "guestbook.status", target: id, detail: { status } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = deleteGuestbookMessage(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  tryAuditRequest(request, { action: "guestbook.delete", target: id });
  return NextResponse.json({ ok: true });
}
