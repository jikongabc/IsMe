import { NextResponse } from "next/server";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { siteProfiles } from "@/lib/db/schema";
import { isCogDocConfigured, isS3Configured } from "@/lib/env";
import { storageBackend } from "@/lib/media/storage";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    getDb().select({ id: siteProfiles.id }).from(siteProfiles).limit(1).all();
    checks.database = { ok: true };
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error instanceof Error ? error.message : "db error",
    };
  }

  // Container liveness must not depend on an optional external RAG service.
  // The authenticated admin dashboard performs the slower CogDoc readiness probe.
  checks.cogdoc = {
    ok: true,
    detail: isCogDocConfigured() ? "configured (readiness in admin)" : "demo mode",
  };

  if (isS3Configured()) {
    checks.storage = { ok: true, detail: `s3 (${storageBackend()}, configured)` };
  } else {
    try {
      await access(path.join(process.cwd(), "public", "uploads"), constants.W_OK);
      checks.storage = { ok: true, detail: "local (writable)" };
    } catch {
      checks.storage = { ok: false, detail: "local uploads directory is not writable" };
    }
  }

  const live = checks.database.ok;
  const degraded = Object.values(checks).some((item) => !item.ok);
  return NextResponse.json(
    {
      status: live && !degraded ? "ok" : "degraded",
      service: "isme",
      checks,
      timestamp: new Date().toISOString(),
    },
    // Optional RAG and upload degradation must not take an otherwise usable
    // portfolio offline. The local database remains the liveness boundary.
    { status: live ? 200 : 503 },
  );
}
