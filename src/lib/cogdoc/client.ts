import { isCogDocConfigured } from "@/lib/env";
import {
  cogdocRequest,
  CogDocRequestError,
  sanitizeCogDocData,
} from "./request";
import { buildDemoAnswer, normalizeChatResponse } from "./normalize";
import type {
  CogDocChatResponse,
  NormalizedChatResult,
} from "./types";

export type {
  CogDocCitation,
  CogDocEvidence,
  CogDocChatResponse,
  CogDocErrorBody,
  NormalizedChatResult,
} from "./types";

export class CogDocClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, _message?: string) {
    void _message;
    const safe = safeClientError(code);
    super(safe.message);
    this.name = "CogDocClientError";
    this.status = status;
    this.code = safe.code;
  }
}

function safeClientError(code: string): { code: string; message: string } {
  switch (code) {
    case "LLM_TIMEOUT":
      return { code, message: "CogDoc request timed out" };
    case "MODEL_UNAVAILABLE":
      return { code, message: "CogDoc service is unavailable" };
    case "COGDOC_REDIRECT_BLOCKED":
      return { code, message: "CogDoc redirect was blocked" };
    case "COGDOC_STREAM_ERROR":
      return { code, message: "CogDoc stream failed" };
    case "COGDOC_UPSTREAM_ERROR":
      return { code, message: "CogDoc request failed" };
    default:
      return { code: "COGDOC_ERROR", message: "CogDoc request failed" };
  }
}

function clientErrorFromRequest(error: CogDocRequestError): CogDocClientError {
  if (error.code === "COGDOC_TIMEOUT") {
    return new CogDocClientError(504, "LLM_TIMEOUT");
  }
  if (error.code === "COGDOC_REDIRECT_BLOCKED") {
    return new CogDocClientError(502, "COGDOC_REDIRECT_BLOCKED");
  }
  return new CogDocClientError(502, "MODEL_UNAVAILABLE");
}

export type ChatParams = {
  docId: string;
  /** Public module slug used only for safe demo-mode copy/session IDs. */
  publicId?: string;
  query: string;
  sessionId?: string | null;
  mode?: "auto" | "qa" | "summary" | "compare";
};

export type StreamEvent =
  | { type: "start"; traceId?: string }
  | { type: "node"; stage: string; detail?: string }
  | { type: "token"; content: string }
  | { type: "final"; result: NormalizedChatResult }
  | { type: "error"; code: string; message: string };

function chatBody(params: ChatParams) {
  return {
    schema_version: "v1",
    query: params.query,
    doc_id: params.docId,
    session_id: params.sessionId ?? null,
    mode: params.mode ?? "auto",
    is_local: false,
  };
}

export async function chatWithCogDoc(params: ChatParams): Promise<NormalizedChatResult> {
  if (!isCogDocConfigured()) {
    return buildDemoAnswer(params.publicId ?? "portfolio", params.query);
  }

  try {
    const res = await cogdocRequest("/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatBody(params)),
    });

    if (!res.ok) {
      throw new CogDocClientError(502, "COGDOC_UPSTREAM_ERROR");
    }

    const data = sanitizeCogDocData((await res.json()) as CogDocChatResponse);
    return sanitizeCogDocData(normalizeChatResponse(data));
  } catch (error) {
    if (error instanceof CogDocClientError) throw error;
    if (error instanceof CogDocRequestError) throw clientErrorFromRequest(error);
    throw new CogDocClientError(502, "MODEL_UNAVAILABLE");
  }
}

async function* demoStream(params: ChatParams): AsyncGenerator<StreamEvent> {
  const result = buildDemoAnswer(params.publicId ?? "portfolio", params.query);
  yield { type: "start", traceId: result.traceId };
  yield { type: "node", stage: "rewrite_queries", detail: "demo rewrite" };
  yield { type: "node", stage: "evidence_verified", detail: "demo evidence" };

  const words = result.answer.split(/(\s+)/);
  for (const word of words) {
    yield { type: "token", content: word };
    await new Promise((resolve) => setTimeout(resolve, 12));
  }

  yield { type: "final", result };
}

function parseSseChunk(buffer: string): {
  frames: Array<{ event: string; data: string }>;
  rest: string;
} {
  const frames: Array<{ event: string; data: string }> = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) {
      frames.push({ event, data: dataLines.join("\n") });
    }
  }

  return { frames, rest };
}

export async function* streamChatWithCogDoc(
  params: ChatParams,
): AsyncGenerator<StreamEvent> {
  if (!isCogDocConfigured()) {
    yield* demoStream(params);
    return;
  }

  try {
    const res = await cogdocRequest("/v1/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(chatBody(params)),
    });

    if (!res.ok || !res.body) {
      yield { type: "error", ...safeClientError("COGDOC_STREAM_ERROR") };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;

      for (const frame of parsed.frames) {
        let payload: Record<string, unknown> = {};
        try {
          payload = sanitizeCogDocData(
            JSON.parse(frame.data) as Record<string, unknown>,
          );
        } catch {
          continue;
        }

        if (frame.event === "start") {
          yield { type: "start", traceId: String(payload.trace_id ?? "") };
        } else if (frame.event === "token") {
          yield { type: "token", content: String(payload.content ?? "") };
        } else if (frame.event === "node") {
          yield {
            type: "node",
            stage: String(payload.stage ?? "node"),
            detail: typeof payload.message === "string" ? payload.message : undefined,
          };
        } else if (frame.event === "final") {
          yield {
            type: "final",
            result: normalizeChatResponse(payload as unknown as CogDocChatResponse),
          };
        } else if (frame.event === "error") {
          yield {
            type: "error",
            ...safeClientError("COGDOC_STREAM_ERROR"),
          };
        }
      }
    }
  } catch (error) {
    if (error instanceof CogDocRequestError) {
      const safe = clientErrorFromRequest(error);
      yield { type: "error", code: safe.code, message: safe.message };
      return;
    }
    yield {
      type: "error",
      code: "MODEL_UNAVAILABLE",
      message: "CogDoc service is unavailable",
    };
  }
}

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
