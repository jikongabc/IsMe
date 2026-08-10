import { NextResponse } from "next/server";
import { clientIpFromRequest } from "@/lib/auth/client-ip";
import { getEnabledKbBySlug } from "@/lib/content/queries";
import { takeToken } from "@/lib/rate-limit";
import { chatRequestSchema } from "@/lib/validators";

export function clientIp(request: Request): string {
  return clientIpFromRequest(request);
}

export async function resolveChatRequest(request: Request) {
  const ip = clientIp(request);
  if (!takeToken(`chat:${ip}`, { limit: 30, windowMs: 60_000 })) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please wait and try again.", code: "RATE_LIMITED" },
        { status: 429 },
      ),
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid JSON body", code: "BAD_REQUEST" },
        { status: 400 },
      ),
    };
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: "Invalid chat request", code: "BAD_REQUEST", details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  const kbModule = await getEnabledKbBySlug(parsed.data.moduleSlug);
  if (!kbModule) {
    return {
      error: NextResponse.json(
        { error: "Knowledge base module not found or disabled", code: "KB_NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  if (!kbModule.cogdocKbId) {
    return {
      error: NextResponse.json(
        {
          error: "This module is not bound to a CogDoc knowledge base yet",
          code: "KB_NOT_BOUND",
        },
        { status: 400 },
      ),
    };
  }

  return {
    data: {
      moduleSlug: kbModule.slug,
      cogdocKbId: kbModule.cogdocKbId,
      query: parsed.data.query,
      sessionId: parsed.data.sessionId ?? null,
    },
  };
}
