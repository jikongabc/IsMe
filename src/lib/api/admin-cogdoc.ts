import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CogDocAdminError } from "@/lib/cogdoc/admin-client";
import { getAdminKnowledgeBaseById } from "@/lib/content/queries";
import { isCogDocConfigured } from "@/lib/env";
import type { KnowledgeBaseModule } from "@/lib/db/schema";

export async function requireAdminOrResponse() {
  return requireAdmin();
}

export function cogdocErrorResponse(error: unknown) {
  if (error instanceof CogDocAdminError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "Unexpected server error", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

export async function loadAdminKb(id: string): Promise<
  | { module: KnowledgeBaseModule }
  | { error: NextResponse }
> {
  if (!isCogDocConfigured()) {
    return {
      error: NextResponse.json(
        {
          error: "COGDOC_API_URL is empty. Configure CogDoc in .env to manage documents.",
          code: "COGDOC_NOT_CONFIGURED",
        },
        { status: 503 },
      ),
    };
  }

  const kbModule = await getAdminKnowledgeBaseById(id);
  if (!kbModule) {
    return {
      error: NextResponse.json({ error: "Knowledge module not found", code: "NOT_FOUND" }, { status: 404 }),
    };
  }
  if (!kbModule.cogdocKbId) {
    return {
      error: NextResponse.json(
        {
          error: "Bind a CogDoc KB ID on this module before syncing documents",
          code: "KB_NOT_BOUND",
        },
        { status: 400 },
      ),
    };
  }
  return { module: kbModule };
}
