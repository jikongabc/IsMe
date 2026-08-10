import { getEnv, isCogDocConfigured } from "@/lib/env";
import { buildDemoAnswer, normalizeChatResponse } from "./normalize";
import type {
  CogDocChatResponse,
  CogDocErrorBody,
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
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CogDocClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
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

function authHeaders(): Record<string, string> {
  const env = getEnv();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.COGDOC_API_KEY) {
    headers.Authorization = `Bearer ${env.COGDOC_API_KEY}`;
  }
  return headers;
}

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

  const env = getEnv();
  const base = env.COGDOC_API_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.COGDOC_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/v1/chat`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(chatBody(params)),
      signal: controller.signal,
    });

    const data = (await res.json()) as CogDocChatResponse | CogDocErrorBody;

    if (!res.ok) {
      const err = data as CogDocErrorBody;
      throw new CogDocClientError(
        res.status,
        err.error_code ?? "COGDOC_ERROR",
        err.message ?? `CogDoc request failed with status ${res.status}`,
        err,
      );
    }

    return normalizeChatResponse(data as CogDocChatResponse);
  } catch (error) {
    if (error instanceof CogDocClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CogDocClientError(504, "LLM_TIMEOUT", "CogDoc request timed out");
    }
    throw new CogDocClientError(
      502,
      "MODEL_UNAVAILABLE",
      error instanceof Error ? error.message : "Failed to reach CogDoc",
    );
  } finally {
    clearTimeout(timer);
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

  const env = getEnv();
  const base = env.COGDOC_API_URL.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.COGDOC_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/v1/chat/stream`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        Accept: "text/event-stream",
      },
      body: JSON.stringify(chatBody(params)),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      let message = `CogDoc stream failed with status ${res.status}`;
      let code = "COGDOC_ERROR";
      try {
        const err = (await res.json()) as CogDocErrorBody;
        message = err.message ?? message;
        code = err.error_code ?? code;
      } catch {
        // ignore
      }
      yield { type: "error", code, message };
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
          payload = JSON.parse(frame.data) as Record<string, unknown>;
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
            code: String(payload.error_code ?? "COGDOC_ERROR"),
            message: String(payload.message ?? "CogDoc stream error"),
          };
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      yield { type: "error", code: "LLM_TIMEOUT", message: "CogDoc request timed out" };
      return;
    }
    yield {
      type: "error",
      code: "MODEL_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Failed to reach CogDoc",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
