import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createExperience, deleteExperience, updateExperience } from "@/lib/content/admin";
import { listAdminExperiences } from "@/lib/content/queries";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { parseJsonBody } from "@/lib/http/parse-json";
import { experienceSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listAdminExperiences() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = experienceSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = createExperience(parsed.data);
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "experience.create",
    target: id,
    detail: { organization: parsed.data.organization },
  });
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = experienceSchema.safeParse(body.data);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "Invalid experience payload" }, { status: 400 });
  }
  updateExperience(parsed.data.id, parsed.data);
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "experience.update",
    target: parsed.data.id,
    detail: { organization: parsed.data.organization },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteExperience(id);
  tryAutoSyncSiteContent();
  tryAuditRequest(request, { action: "experience.delete", target: id });
  return NextResponse.json({ ok: true });
}
