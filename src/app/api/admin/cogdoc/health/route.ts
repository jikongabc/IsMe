import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { checkCogDocHealth } from "@/lib/cogdoc/admin-client";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const health = await checkCogDocHealth();
  return NextResponse.json(health);
}
