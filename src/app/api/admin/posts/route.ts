import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createBlogPost, deleteBlogPost, updateBlogPost } from "@/lib/content/admin";
import { tryAutoSyncSiteContent } from "@/lib/content/sync-to-cogdoc";
import { parseJsonBody } from "@/lib/http/parse-json";
import { mutationErrorResponse } from "@/lib/http/mutation-error";
import { listAdminPosts } from "@/lib/content/queries";
import { blogPostSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ items: await listAdminPosts() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = blogPostSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let id: string;
  try {
    id = createBlogPost(parsed.data);
  } catch (error) {
    return mutationErrorResponse(error, "Post");
  }
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "post.create",
    target: id,
    detail: { slug: parsed.data.slug, status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, id });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = blogPostSchema.safeParse(body.data);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "Invalid post payload" }, { status: 400 });
  }
  try {
    updateBlogPost(parsed.data.id, parsed.data);
  } catch (error) {
    return mutationErrorResponse(error, "Post");
  }
  tryAutoSyncSiteContent();
  tryAuditRequest(request, {
    action: "post.update",
    target: parsed.data.id,
    detail: { slug: parsed.data.slug, status: parsed.data.status },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteBlogPost(id);
  tryAutoSyncSiteContent();
  tryAuditRequest(request, { action: "post.delete", target: id });
  return NextResponse.json({ ok: true });
}
