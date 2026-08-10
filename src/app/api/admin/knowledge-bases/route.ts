import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
} from "@/lib/content/admin";
import { listAdminKnowledgeBases } from "@/lib/content/queries";
import { parseJsonBody } from "@/lib/http/parse-json";
import { mutationErrorResponse } from "@/lib/http/mutation-error";
import { knowledgeBaseSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listAdminKnowledgeBases() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = knowledgeBaseSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let id: string;
  try {
    id = createKnowledgeBase(parsed.data);
  } catch (error) {
    return mutationErrorResponse(error, "Knowledge base");
  }
  tryAuditRequest(request, {
    action: "kb.create",
    target: id,
    detail: { slug: parsed.data.slug },
  });
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = knowledgeBaseSchema.safeParse(body.data);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "Invalid knowledge base payload" }, { status: 400 });
  }
  try {
    updateKnowledgeBase(parsed.data.id, parsed.data);
  } catch (error) {
    return mutationErrorResponse(error, "Knowledge base");
  }
  tryAuditRequest(request, {
    action: "kb.update",
    target: parsed.data.id,
    detail: { slug: parsed.data.slug },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteKnowledgeBase(id);
  tryAuditRequest(request, { action: "kb.delete", target: id });
  return NextResponse.json({ ok: true });
}
