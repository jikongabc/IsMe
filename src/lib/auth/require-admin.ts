import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/session";

export async function requireAdmin(): Promise<NextResponse | null> {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
