import { beforeEach, describe, expect, it, vi } from "vitest";

const CANARY_KEY = "canary-cogdoc-key-never-leak";
const env = vi.hoisted(() => ({
  COGDOC_API_URL: "https://cogdoc.example.test",
  COGDOC_API_KEY: "canary-cogdoc-key-never-leak",
  COGDOC_TIMEOUT_MS: 25,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getEnv: () => env,
  isCogDocConfigured: () => true,
}));

import {
  cogdocRequest,
  CogDocRequestError,
} from "@/lib/cogdoc/request";

describe("cogdocRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("owns URL resolution, bearer auth, timeout signal, and redirect policy", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await cogdocRequest("/v1/chat?mode=qa", {
      method: "POST",
      headers: { Authorization: "Bearer caller-controlled", "Content-Type": "application/json" },
      body: "{}",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as Array<[
      string | URL | Request,
      RequestInit,
    ]>;
    const [url, init] = calls[0]!;
    expect(String(url)).toBe("https://cogdoc.example.test/v1/chat?mode=qa");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${CANARY_KEY}`);
  });

  it.each([
    "https://other.example/v1/chat",
    "//other.example/v1/chat",
    "/v1/chat#fragment",
    "/v1\\chat",
    "/v1/../healthz",
    "/v1/%2e%2e/healthz",
  ])("rejects a non-relative or ambiguous request path: %s", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(cogdocRequest(path)).rejects.toMatchObject({
      code: "COGDOC_INVALID_PATH",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [301, "https://cogdoc.example.test/next"],
    [301, "https://other.example/next"],
    [302, "https://cogdoc.example.test/next"],
    [302, "https://other.example/next"],
    [307, "https://cogdoc.example.test/next"],
    [307, "https://other.example/next"],
    [308, "https://cogdoc.example.test/next"],
    [308, "https://other.example/next"],
  ])("blocks status %i without a same-origin or cross-origin second hop", async (status, location) => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status,
      headers: { Location: location },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await cogdocRequest("/v1/chat").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CogDocRequestError);
    expect(error).toMatchObject({
      status: 502,
      code: "COGDOC_REDIRECT_BLOCKED",
      message: "CogDoc redirect was blocked",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as Array<[
      string | URL | Request,
      RequestInit,
    ]>;
    expect(calls[0]?.[1].redirect).toBe("manual");
    expect(JSON.stringify(error)).not.toContain(CANARY_KEY);
    expect(String(error)).not.toContain(location);
  });

  it("maps transport details to one stable safe error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error(`connect failed for https://user:pass@internal.example using ${CANARY_KEY}`);
    }));

    const error = await cogdocRequest("/healthz").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      status: 502,
      code: "COGDOC_UNAVAILABLE",
      message: "CogDoc service is unavailable",
    });
    expect(String(error)).not.toContain(CANARY_KEY);
    expect(String(error)).not.toContain("user:pass");
  });

  it("enforces the configured timeout through the shared abort signal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      })
    )));

    const assertion = expect(cogdocRequest("/healthz")).rejects.toMatchObject({
      status: 504,
      code: "COGDOC_TIMEOUT",
      message: "CogDoc request timed out",
    });
    await vi.advanceTimersByTimeAsync(env.COGDOC_TIMEOUT_MS);
    await assertion;
    vi.useRealTimers();
  });
});
