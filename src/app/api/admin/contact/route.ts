import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  deleteContactMessage,
  listAdminContacts,
  setContactStatus,
} from "@/lib/contact/store";
import { parseJsonBody } from "@/lib/http/parse-json";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: listAdminContacts() });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const { id, status } = parsed.data as { id?: string; status?: string };
  if (!id || !["unread", "read", "archived"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const ok = setContactStatus(id, status as "unread" | "read" | "archived");
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  tryAuditRequest(request, { action: "contact.status", target: id, detail: { status } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = deleteContactMessage(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  tryAuditRequest(request, { action: "contact.delete", target: id });
  return NextResponse.json({ ok: true });
}
