import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createProject, deleteProject, updateProject } from "@/lib/content/admin";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { parseJsonBody } from "@/lib/http/parse-json";
import { mutationErrorResponse } from "@/lib/http/mutation-error";
import { listAdminProjects } from "@/lib/content/queries";
import { projectIdSchema, projectSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listAdminProjects() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = projectSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let id: string;
  try {
    id = createProject(parsed.data);
  } catch (error) {
    return mutationErrorResponse(error, "Project");
  }
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "project.create",
    target: id,
    detail: { slug: parsed.data.slug, status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = projectSchema.safeParse(body.data);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
  }
  let updated: boolean;
  try {
    updated = updateProject(parsed.data.id, parsed.data);
  } catch (error) {
    return mutationErrorResponse(error, "Project");
  }
  if (!updated) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "project.update",
    target: parsed.data.id,
    detail: { slug: parsed.data.slug, status: parsed.data.status },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const parsedId = projectIdSchema.safeParse(searchParams.get("id"));
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  let deleted: boolean;
  try {
    deleted = deleteProject(parsedId.data);
  } catch (error) {
    return mutationErrorResponse(error, "Project");
  }
  if (!deleted) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  tryAutoSyncSiteContent();
  tryAuditRequest(request, { action: "project.delete", target: parsedId.data });
  return NextResponse.json({ ok: true });
}
