import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminMutation } from "@/lib/auth/require-admin";
import { privateJson, requireSameOrigin } from "@/lib/http/admin-request";
import { parseJsonBody } from "@/lib/http/parse-json";

const sessionMocks = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => sessionMocks);

beforeEach(() => {
  sessionMocks.isAdminAuthenticated.mockReset();
});

describe("admin mutation origin guard", () => {
  it("accepts an exact same-origin request", () => {
    const request = new Request("https://portfolio.example/api/admin/setup/demo-cleanup", {
      method: "POST",
      headers: { origin: "https://portfolio.example" },
    });

    expect(requireSameOrigin(request)).toBeNull();
  });

  it("uses the normalized Host and singular forwarded protocol behind the bundled proxy", () => {
    const request = new Request("http://web:3000/api/admin/portfolio-pack/import", {
      method: "POST",
      headers: {
        origin: "https://me.example",
        host: "me.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(requireSameOrigin(request)).toBeNull();
  });

  it("ignores an untrusted client-supplied X-Forwarded-Host", () => {
    const request = new Request("http://web:3000/api/admin/portfolio-pack/import", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        host: "me.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(requireSameOrigin(request)?.status).toBe(403);
  });

  it.each([
    [undefined, "missing"],
    ["null", "opaque"],
    ["https://attacker.example", "cross-origin"],
    ["https://portfolio.example/path", "non-origin URL"],
  ])("rejects %s Origin (%s)", (origin, label) => {
    const headers = origin ? { origin } : undefined;
    const result = requireSameOrigin(
      new Request("https://portfolio.example/api/admin/portfolio-pack/import", {
        method: "POST",
        headers,
      }),
    );

    expect(result?.status).toBe(403);
    expect(result?.headers.get("cache-control")).toContain("no-store");
    expect(label.length).toBeGreaterThan(0);
  });

  it("adds private no-store headers to JSON responses", () => {
    const result = privateJson({ ok: true });
    expect(result.headers.get("cache-control")).toContain("private");
    expect(result.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects a cross-origin mutation before checking the session", async () => {
    sessionMocks.isAdminAuthenticated.mockResolvedValue(true);

    const result = await requireAdminMutation(
      new Request("https://portfolio.example/api/admin/profile", {
        method: "PUT",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(result?.status).toBe(403);
    expect(result?.headers.get("cache-control")).toContain("private");
    expect(result?.headers.get("cache-control")).toContain("no-store");
    expect(sessionMocks.isAdminAuthenticated).not.toHaveBeenCalled();
  });

  it("returns a private no-store 401 for a same-origin mutation without a session", async () => {
    sessionMocks.isAdminAuthenticated.mockResolvedValue(false);

    const result = await requireAdminMutation(
      new Request("https://portfolio.example/api/admin/profile", {
        method: "PUT",
        headers: { origin: "https://portfolio.example" },
      }),
    );

    expect(result?.status).toBe(401);
    expect(result?.headers.get("cache-control")).toContain("private");
    expect(result?.headers.get("cache-control")).toContain("no-store");
  });

  it.each([
    ["direct development", "https://portfolio.example", undefined, undefined],
    ["bundled proxy", "http://web:3000", "me.example", "https"],
  ])("accepts an authenticated same-origin mutation through %s", async (_label, url, host, proto) => {
    sessionMocks.isAdminAuthenticated.mockResolvedValue(true);
    const origin = host ? `${proto}://${host}` : url;
    const headers = new Headers({ origin });
    if (host) headers.set("host", host);
    if (proto) headers.set("x-forwarded-proto", proto);

    await expect(
      requireAdminMutation(
        new Request(`${url}/api/admin/profile`, {
          method: "PUT",
          headers,
        }),
      ),
    ).resolves.toBeNull();
  });
});

describe("bounded JSON parser", () => {
  it("accepts application/json with parameters within the byte limit", async () => {
    const result = await parseJsonBody(
      new Request("https://portfolio.example/api/admin/portfolio-pack/preview", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ pack: { version: "portfolio-pack.v1" } }),
      }),
      { maxBytes: 1024, requireJsonContentType: true },
    );

    expect(result.ok).toBe(true);
  });

  it("rejects missing or non-JSON media types", async () => {
    const result = await parseJsonBody(
      new Request("https://portfolio.example/api/admin/portfolio-pack/preview", {
        method: "POST",
        body: "{}",
      }),
      { maxBytes: 1024, requireJsonContentType: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(415);
  });

  it("rejects a declared oversized body before parsing", async () => {
    const result = await parseJsonBody(
      new Request("https://portfolio.example/api/admin/portfolio-pack/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2048",
        },
        body: "{}",
      }),
      { maxBytes: 1024, requireJsonContentType: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
  });

  it("enforces the actual streamed byte count when Content-Length is absent", async () => {
    const result = await parseJsonBody(
      new Request("https://portfolio.example/api/admin/portfolio-pack/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "界".repeat(400) }),
      }),
      { maxBytes: 1024, requireJsonContentType: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
    expect(result.response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a sanitized malformed-body response", async () => {
    const result = await parseJsonBody(
      new Request("https://portfolio.example/api/admin/portfolio-pack/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      { maxBytes: 1024, requireJsonContentType: true },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "Malformed JSON body" });
  });
});
