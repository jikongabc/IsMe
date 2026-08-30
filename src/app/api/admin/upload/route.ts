import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { detectImageMime } from "@/lib/media/image-bytes";
import { makeUploadFileName } from "@/lib/media/keys";
import { saveMedia } from "@/lib/media/registry";
import { storageBackend } from "@/lib/media/storage";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageMime(bytes);
  if (!detected || !ALLOWED.has(detected)) {
    return NextResponse.json(
      { error: "Only jpeg/png/webp/gif images are allowed" },
      { status: 400 },
    );
  }

  // Prefer magic-byte MIME; reject spoofed Content-Type when client sends one.
  if (file.type && ALLOWED.has(file.type) && file.type !== detected) {
    return NextResponse.json(
      { error: "File content does not match declared type" },
      { status: 400 },
    );
  }

  const name = makeUploadFileName(detected);

  try {
    const stored = await saveMedia(name, bytes, detected);
    tryAuditRequest(request, {
      action: "upload.create",
      target: stored.url,
      detail: { type: detected, storage: stored.storage },
    });
    return NextResponse.json({
      ok: true,
      url: stored.url,
      name: stored.name,
      storage: storageBackend(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
