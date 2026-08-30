import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import {
  changeAdminPassword,
  hashAdminPassword,
  hasDbPasswordOverride,
} from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearAdminSession } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({
    overrideActive: hasDbPasswordOverride(),
    source: hasDbPasswordOverride() ? "database" : "env",
  });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const changed = changeAdminPassword(
    parsed.data.currentPassword,
    hashAdminPassword(parsed.data.newPassword),
  );
  if (!changed) {
    tryAuditRequest(request, {
      action: "auth.password_change",
      ok: false,
      detail: { reason: "bad_current" },
    });
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  await clearAdminSession();
  tryAuditRequest(request, { action: "auth.password_change", ok: true });
  return NextResponse.json({ ok: true, source: "database" });
}
