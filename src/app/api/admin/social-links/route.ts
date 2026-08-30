import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createSocialLink, deleteSocialLink, updateSocialLink } from "@/lib/content/admin";
import { listAdminSocialLinks } from "@/lib/content/queries";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { parseJsonBody } from "@/lib/http/parse-json";
import { socialLinkSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listAdminSocialLinks() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = socialLinkSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = createSocialLink(parsed.data);
  tryAutoSyncSiteContent();
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = socialLinkSchema.safeParse(body.data);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "Invalid social link" }, { status: 400 });
  }
  updateSocialLink(parsed.data.id, parsed.data);
  tryAutoSyncSiteContent();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteSocialLink(id);
  tryAutoSyncSiteContent();
  return NextResponse.json({ ok: true });
}
