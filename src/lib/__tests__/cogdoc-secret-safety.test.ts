import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CANARY_KEY = "canary-cogdoc-key-never-leak";
const CREDENTIALED_URL = "https://canary-user:canary-password@internal.example/private";
const env = vi.hoisted(() => ({
  COGDOC_API_URL: "https://cogdoc.example.test",
  COGDOC_API_KEY: "canary-cogdoc-key-never-leak",
  COGDOC_TIMEOUT_MS: 100,
}));
const routeMocks = vi.hoisted(() => ({
  getEnabledKbBySlug: vi.fn(),
  resolveChatRequest: vi.fn(),
  takeToken: vi.fn(),
  tryRecordAnswerFeedback: vi.fn(),
  tryRecordChatEvent: vi.fn(),
}));
let serverLogs: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getEnv: () => env,
  isCogDocConfigured: () => true,
}));
vi.mock("@/lib/chat/resolve-module", () => ({
  resolveChatRequest: routeMocks.resolveChatRequest,
}));
vi.mock("@/lib/content/queries", () => ({
  getEnabledKbBySlug: routeMocks.getEnabledKbBySlug,
}));
vi.mock("@/lib/rate-limit", () => ({ takeToken: routeMocks.takeToken }));
vi.mock("@/lib/analytics/chat-events", () => ({
  tryRecordAnswerFeedback: routeMocks.tryRecordAnswerFeedback,
  tryRecordChatEvent: routeMocks.tryRecordChatEvent,
}));

import { POST as chatPost } from "@/app/api/chat/route";
import { POST as streamPost } from "@/app/api/chat/stream/route";
import { POST as feedbackPost } from "@/app/api/feedback/route";
import { cogdocErrorResponse } from "@/lib/api/admin-cogdoc";
import {
  CogDocAdminError,
  getIndexJob,
} from "@/lib/cogdoc/admin-client";

function assertNoSecrets(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  expect(serialized).not.toContain(CANARY_KEY);
  expect(serialized).not.toContain("canary-user");
  expect(serialized).not.toContain("canary-password");
  expect(serialized).not.toContain(CREDENTIALED_URL);
}

describe("CogDoc public/admin secret safety", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    serverLogs = [];
    for (const method of ["error", "warn", "log"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        serverLogs.push(args.map(String).join(" "));
      });
    }
    routeMocks.resolveChatRequest.mockResolvedValue({
      data: {
        moduleSlug: "portfolio",
        cogdocKbId: "kb-private",
        query: "question",
        sessionId: null,
      },
    });
    routeMocks.getEnabledKbBySlug.mockResolvedValue({ cogdocKbId: "kb-private" });
    routeMocks.takeToken.mockReturnValue(true);
  });

  afterEach(() => {
    assertNoSecrets(serverLogs);
  });

  it("keeps upstream JSON error details out of the public chat response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error_code: CANARY_KEY,
      message: `${CREDENTIALED_URL} ${CANARY_KEY}`,
    }, { status: 500 })));

    const response = await chatPost(new Request("http://localhost/api/chat", {
      method: "POST",
    }));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "CogDoc request failed",
      code: "COGDOC_UPSTREAM_ERROR",
    });
    assertNoSecrets(body);
  });

  it("redacts credentials echoed in a successful public chat response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      schema_version: "v1",
      request_id: `request-${CANARY_KEY}`,
      trace_id: `trace-${CANARY_KEY}`,
      doc_id: "kb-private",
      session_id: `session-${CANARY_KEY}`,
      task_type: "qa",
      answer: `${CREDENTIALED_URL} ${CANARY_KEY}`,
      citations: [{
        source: CREDENTIALED_URL,
        page: 1,
        chunk_id: CANARY_KEY,
      }],
      evidence: [],
      critique: CANARY_KEY,
      is_valid: true,
    })));

    const response = await chatPost(new Request("http://localhost/api/chat", {
      method: "POST",
    }));
    expect(response.status).toBe(200);
    assertNoSecrets(await response.json());
  });

  it("keeps upstream SSE error details out of the public stream", async () => {
    const upstream = `event: error\ndata: ${JSON.stringify({
      error_code: CANARY_KEY,
      message: `${CREDENTIALED_URL} ${CANARY_KEY}`,
    })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(upstream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })));

    const response = await streamPost(new Request("http://localhost/api/chat/stream", {
      method: "POST",
    }));
    const body = await response.text();
    expect(body).toContain("COGDOC_STREAM_ERROR");
    expect(body).toContain("CogDoc stream failed");
    assertNoSecrets(body);
  });

  it("keeps upstream feedback errors stable and safe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error_code: CANARY_KEY,
      message: `${CREDENTIALED_URL} ${CANARY_KEY}`,
    }, { status: 503 })));
    const response = await feedbackPost(new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleSlug: "portfolio",
        traceId: "trace-1",
        feedback: "thumbs_up",
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "CogDoc request failed",
      code: "COGDOC_UPSTREAM_ERROR",
    });
    assertNoSecrets(body);
  });

  it("sanitizes admin errors and job summaries even if upstream echoes credentials", async () => {
    const errorResponse = cogdocErrorResponse(new CogDocAdminError(
      502,
      CANARY_KEY,
      `${CREDENTIALED_URL} ${CANARY_KEY}`,
    ));
    const errorBody = await errorResponse.json();
    expect(errorBody).toEqual({
      error: "CogDoc request failed",
      code: "COGDOC_ERROR",
    });
    assertNoSecrets(errorBody);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      job_id: "job-1",
      kb_id: "kb-private",
      status: "failed",
      created_at: "now",
      finished_at: "now",
      document_count: null,
      chunk_count: null,
      message: `${CREDENTIALED_URL} ${CANARY_KEY}`,
      error_code: CANARY_KEY,
    })));
    const job = await getIndexJob("job-1");
    expect(job.message).toBe("CogDoc job failed");
    expect(job.error_code).toBe("COGDOC_JOB_ERROR");
    assertNoSecrets(job);
  });
});
