import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/session";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";

export async function requireAdmin(request?: Request): Promise<NextResponse | null> {
  if (request) return requireAdminMutation(request);
  if (!(await isAdminAuthenticated())) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function requireAdminMutation(request: Request): Promise<NextResponse | null> {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  return requireAdmin();
}
