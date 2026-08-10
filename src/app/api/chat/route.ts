import { NextResponse } from "next/server";
import { tryRecordChatEvent } from "@/lib/analytics/chat-events";
import { resolveChatRequest } from "@/lib/chat/resolve-module";
import { chatWithCogDoc, CogDocClientError } from "@/lib/cogdoc/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const resolved = await resolveChatRequest(request);
  if (resolved.error) return resolved.error;

  const { moduleSlug, cogdocKbId, query, sessionId } = resolved.data;

  try {
    const result = await chatWithCogDoc({
      docId: cogdocKbId,
      publicId: moduleSlug,
      query,
      sessionId,
    });

    tryRecordChatEvent({
      moduleSlug,
      query,
      sessionId: result.sessionId ?? sessionId,
      traceId: result.traceId,
      demo: result.demo,
    });

    return NextResponse.json({
      answer: result.answer,
      sessionId: result.sessionId,
      requestId: result.requestId,
      traceId: result.traceId,
      taskType: result.taskType,
      isValid: result.isValid,
      citations: result.citations,
      evidence: result.evidence,
      demo: result.demo,
      moduleSlug,
    });
  } catch (error) {
    if (error instanceof CogDocClientError) {
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
}
