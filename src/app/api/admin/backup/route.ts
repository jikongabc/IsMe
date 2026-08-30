import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { tryAuditRequest } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { backupDatabase } from "@/lib/db/backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let tempDir = "";
  try {
    tempDir = await mkdtemp(path.join(tmpdir(), "isme-backup-"));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `isme-${stamp}.db`;
    const dest = path.join(tempDir, filename);
    await backupDatabase(dest);
    const bytes = await readFile(dest);
    tryAuditRequest(request, {
      action: "backup.create",
      target: filename,
      detail: { bytes: bytes.length },
    });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    tryAuditRequest(request, {
      action: "backup.create",
      ok: false,
      detail: { error: error instanceof Error ? error.message : "failed" },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "backup failed" },
      { status: 500 },
    );
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
