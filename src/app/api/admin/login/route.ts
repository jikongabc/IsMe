import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { clientIpFromRequest } from "@/lib/auth/client-ip";
import { createAdminSession, verifyAdminPassword } from "@/lib/auth/session";
import { takeToken } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);

  if (!takeToken(`admin-login:${ip}`, { limit: 10, windowMs: 60_000 })) {
    tryAuditRequest(request, { action: "auth.login", ok: false, detail: { reason: "rate_limited" } });
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    tryAuditRequest(request, { action: "auth.login", ok: false, detail: { reason: "bad_payload" } });
    return NextResponse.json({ error: "Invalid credentials payload" }, { status: 400 });
  }

  if (!verifyAdminPassword(parsed.data.password)) {
    tryAuditRequest(request, { action: "auth.login", ok: false, detail: { reason: "bad_password" } });
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createAdminSession();
  tryAuditRequest(request, { action: "auth.login", ok: true });
  return NextResponse.json({ ok: true });
}
