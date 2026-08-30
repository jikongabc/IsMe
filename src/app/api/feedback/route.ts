import { NextResponse } from "next/server";
import { z } from "zod";
import { tryRecordAnswerFeedback } from "@/lib/analytics/chat-events";
import { clientIpFromRequest } from "@/lib/auth/client-ip";
import {
  cogdocRequest,
  CogDocRequestError,
  sanitizeCogDocData,
} from "@/lib/cogdoc/request";
import { getEnabledKbBySlug } from "@/lib/content/queries";
import { isCogDocConfigured } from "@/lib/env";
import { takeToken } from "@/lib/rate-limit";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  moduleSlug: z.string().min(1).max(120),
  traceId: z.string().min(1).max(200),
  feedback: z.enum(["thumbs_up", "thumbs_down"]),
  sessionId: z.string().max(200).nullable().optional(),
  query: z.string().max(2000).optional(),
  answer: z.string().max(20_000).optional(),
  comment: z.string().max(2000).optional(),
  feedbackType: z
    .enum(["no_evidence", "wrong_answer", "bad_retrieval", "correction", "other"])
    .optional(),
});

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);

  if (!takeToken(`feedback:${ip}`, { limit: 40, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid feedback payload", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const kbModule = await getEnabledKbBySlug(parsed.data.moduleSlug);
  if (!kbModule || !kbModule.cogdocKbId) {
    return NextResponse.json({ error: "Knowledge module not found", code: "KB_NOT_FOUND" }, { status: 404 });
  }

  if (!isCogDocConfigured()) {
    tryRecordAnswerFeedback({
      moduleSlug: parsed.data.moduleSlug,
      traceId: parsed.data.traceId,
      feedback: parsed.data.feedback,
      comment: parsed.data.comment,
      demo: true,
    });
    return NextResponse.json({
      ok: true,
      demo: true,
      status: "recorded",
      feedbackId: `demo_fb_${crypto.randomUUID()}`,
    });
  }

  try {
    const res = await cogdocRequest("/v1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: "v1",
        trace_id: parsed.data.traceId,
        feedback: parsed.data.feedback,
        kb_id: kbModule.cogdocKbId,
        session_id: parsed.data.sessionId ?? null,
        query: parsed.data.query,
        answer: parsed.data.answer,
        comment: parsed.data.comment,
        feedback_type: parsed.data.feedbackType,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "CogDoc request failed", code: "COGDOC_UPSTREAM_ERROR" },
        { status: 502 },
      );
    }

    const data = sanitizeCogDocData((await res.json()) as {
      feedback_id?: string;
      status?: string;
    });

    tryRecordAnswerFeedback({
      moduleSlug: parsed.data.moduleSlug,
      traceId: parsed.data.traceId,
      feedback: parsed.data.feedback,
      comment: parsed.data.comment,
      demo: false,
    });

    return NextResponse.json({
      ok: true,
      demo: false,
      status: data.status ?? "recorded",
      feedbackId: data.feedback_id,
    });
  } catch (error) {
    if (error instanceof CogDocRequestError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "CogDoc service is unavailable",
        code: "MODEL_UNAVAILABLE",
      },
      { status: 502 },
    );
  }
}
