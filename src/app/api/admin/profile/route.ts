import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { upsertProfile } from "@/lib/content/admin";
import { getAdminProfile, listAdminFocusAreas, listAdminSocialLinks } from "@/lib/content/queries";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { parseJsonBody } from "@/lib/http/parse-json";
import { profileSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [profile, socialLinks, focusAreas] = await Promise.all([
    getAdminProfile(),
    listAdminSocialLinks(),
    listAdminFocusAreas(),
  ]);

  return NextResponse.json({ profile, socialLinks, focusAreas });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = profileSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = upsertProfile(parsed.data);
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "profile.update",
    target: id,
    detail: { displayName: parsed.data.displayName },
  });
  return NextResponse.json({ ok: true, id });
}
