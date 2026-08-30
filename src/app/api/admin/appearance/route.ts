import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateSiteAppearance } from "@/lib/content/admin";
import { getSiteAppearance } from "@/lib/content/queries";
import { parseJsonBody } from "@/lib/http/parse-json";
import { appearanceSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await getSiteAppearance());
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = appearanceSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = updateSiteAppearance(parsed.data);
  tryAuditRequest(request, {
    action: "appearance.update",
    target: id,
    detail: parsed.data,
  });
  return NextResponse.json({ ok: true, ...parsed.data });
}
