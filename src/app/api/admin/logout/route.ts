import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearAdminSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  await clearAdminSession();
  tryAuditRequest(request, { action: "auth.logout", ok: true });
  return NextResponse.json({ ok: true });
}
