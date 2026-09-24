import { beforeEach, describe, expect, it, vi } from "vitest";

const MAX_BODY_BYTES = 131_072;
const mocks = vi.hoisted(() => ({
  clientIpFromRequest: vi.fn(),
  cogdocRequest: vi.fn(),
  getEnabledKbBySlug: vi.fn(),
  isCogDocConfigured: vi.fn(),
  sanitizeCogDocData: vi.fn((value: unknown) => value),
  takeToken: vi.fn(),
  tryRecordAnswerFeedback: vi.fn(),
}));

vi.mock("@/lib/analytics/chat-events", () => ({
  tryRecordAnswerFeedback: mocks.tryRecordAnswerFeedback,
}));
vi.mock("@/lib/auth/client-ip", () => ({
  clientIpFromRequest: mocks.clientIpFromRequest,
}));
vi.mock("@/lib/cogdoc/request", () => ({
  cogdocRequest: mocks.cogdocRequest,
  CogDocRequestError: class CogDocRequestError extends Error {},
  sanitizeCogDocData: mocks.sanitizeCogDocData,
}));
vi.mock("@/lib/content/queries", () => ({
  getEnabledKbBySlug: mocks.getEnabledKbBySlug,
}));
vi.mock("@/lib/env", () => ({
  isCogDocConfigured: mocks.isCogDocConfigured,
}));
vi.mock("@/lib/rate-limit", () => ({ takeToken: mocks.takeToken }));

import { POST } from "@/app/api/feedback/route";

const validFeedback = {
  moduleSlug: "portfolio",
  traceId: "trace-1",
  feedback: "thumbs_up",
};

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

function paddedValidFeedback(bytes: number): string {
  const body = JSON.stringify(validFeedback);
  if (body.length > bytes) throw new Error("Feedback fixture exceeds requested size");
  return body.padEnd(bytes, " ");
}

function expectNoFeedbackSideEffects(): void {
  expect(mocks.getEnabledKbBySlug).not.toHaveBeenCalled();
  expect(mocks.cogdocRequest).not.toHaveBeenCalled();
  expect(mocks.tryRecordAnswerFeedback).not.toHaveBeenCalled();
}

describe("feedback route bounded JSON body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientIpFromRequest.mockReturnValue("127.0.0.1");
    mocks.takeToken.mockReturnValue(true);
    mocks.getEnabledKbBySlug.mockResolvedValue({ cogdocKbId: "kb-1" });
    mocks.isCogDocConfigured.mockReturnValue(false);
    mocks.sanitizeCogDocData.mockImplementation((value: unknown) => value);
  });

  it("accepts a valid body at exactly 131072 bytes", async () => {
    const response = await POST(jsonRequest(paddedValidFeedback(MAX_BODY_BYTES)));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      demo: true,
      status: "recorded",
      feedbackId: expect.stringMatching(/^demo_fb_/),
    });
    expect(mocks.getEnabledKbBySlug).toHaveBeenCalledWith("portfolio");
  });

  it("rejects a declared 131073-byte body before downstream work", async () => {
    const response = await POST(jsonRequest("{}", {
      "Content-Length": String(MAX_BODY_BYTES + 1),
    }));

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({ error: "Request body is too large" });
    expectNoFeedbackSideEffects();
  });

  it("cancels an unbounded stream after its 131073rd byte", async () => {
    const cancel = vi.fn();
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(
          pullCount === 1
            ? new Uint8Array(MAX_BODY_BYTES).fill(0x20)
            : new Uint8Array([0x20]),
        );
      },
      cancel,
    });
    const request = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(cancel).toHaveBeenCalledOnce();
    expectNoFeedbackSideEffects();
  });

  it("preserves the malformed JSON BAD_REQUEST response", async () => {
    const response = await POST(jsonRequest("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON", code: "BAD_REQUEST" });
    expectNoFeedbackSideEffects();
  });

  it("preserves feedback schema validation", async () => {
    const response = await POST(jsonRequest(JSON.stringify({
      ...validFeedback,
      feedback: "neutral",
    })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid feedback payload",
      code: "BAD_REQUEST",
    });
    expectNoFeedbackSideEffects();
  });

  it("preserves the configured upstream success response", async () => {
    mocks.isCogDocConfigured.mockReturnValue(true);
    mocks.cogdocRequest.mockResolvedValue(Response.json({
      feedback_id: "fb-1",
      status: "recorded",
    }));

    const response = await POST(jsonRequest(JSON.stringify(validFeedback)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      demo: false,
      status: "recorded",
      feedbackId: "fb-1",
    });
    expect(mocks.tryRecordAnswerFeedback).toHaveBeenCalledWith({
      moduleSlug: "portfolio",
      traceId: "trace-1",
      feedback: "thumbs_up",
      comment: undefined,
      demo: false,
    });
  });
});
