import { beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({
  getEnv: vi.fn(() => ({
    COGDOC_API_URL: "https://cogdoc.internal",
    COGDOC_API_KEY: "test-service-key",
  })),
  isCogDocConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/env", () => envMocks);

import {
  checkCogDocReadiness,
  MAX_COGDOC_READINESS_KBS,
} from "@/lib/cogdoc/admin-client";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("checkCogDocReadiness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envMocks.isCogDocConfigured.mockReturnValue(true);
  });

  it("accepts a KB backed by documents or approved derived knowledge", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/healthz")) return new Response(null, { status: 200 });
      if (url.endsWith("/knowledge-bases/kb-doc")) {
        return json({ kb_id: "kb-doc", document_count: 2, created_at: "now" });
      }
      if (url.endsWith("/knowledge-bases/kb-derived")) {
        return json({ kb_id: "kb-derived", document_count: 0, created_at: "now" });
      }
      if (url.includes("/v1/knowledge?kb_id=kb-derived")) {
        return json({
          knowledge: [
            {
              knowledge_id: "knowledge-1",
              kb_id: "kb-derived",
              text: "portfolio evidence",
              status: "approved",
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkCogDocReadiness(["kb-doc", "kb-derived"])).resolves.toEqual({
      ok: true,
      status: 200,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: 0,
    });
  });

  it("fails when an enabled KB is missing or has no retrievable content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/healthz")) return new Response(null, { status: 200 });
        if (url.endsWith("/knowledge-bases/kb-missing")) {
          return new Response(null, { status: 404 });
        }
        if (url.endsWith("/knowledge-bases/kb-empty")) {
          return json({ kb_id: "kb-empty", document_count: 0, created_at: "now" });
        }
        if (url.includes("/v1/knowledge?kb_id=kb-empty")) {
          return json({ knowledge: [] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    await expect(checkCogDocReadiness(["kb-missing", "kb-empty"])).resolves.toEqual({
      ok: false,
      status: 200,
      missingCount: 1,
      emptyCount: 1,
      unverifiedCount: 0,
    });
  });

  it("fails closed when the bounded probe cannot cover every configured KB", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/healthz")) return new Response(null, { status: 200 });
      throw new Error(`KB inspection should not start: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const ids = Array.from(
      { length: MAX_COGDOC_READINESS_KBS + 1 },
      (_, index) => `kb-${index}`,
    );

    await expect(checkCogDocReadiness(ids)).resolves.toMatchObject({
      ok: false,
      unverifiedCount: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not expose transport failures through the readiness result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("secret internal host failed");
      }),
    );

    const result = await checkCogDocReadiness(["kb-one"]);
    expect(result).toMatchObject({ ok: false, unverifiedCount: 1 });
    expect(JSON.stringify(result)).not.toContain("secret internal host");
  });
});
