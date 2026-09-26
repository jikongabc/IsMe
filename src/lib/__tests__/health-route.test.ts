import path from "node:path";
import { constants } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbAll: vi.fn(),
  access: vi.fn(),
  isCogDocConfigured: vi.fn(),
  isS3Configured: vi.fn(),
  storageBackend: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        limit: () => ({ all: mocks.dbAll }),
      }),
    }),
  }),
}));
vi.mock("@/lib/db/schema", () => ({ siteProfiles: { id: "id" } }));
vi.mock("@/lib/env", () => ({
  isCogDocConfigured: mocks.isCogDocConfigured,
  isS3Configured: mocks.isS3Configured,
}));
vi.mock("@/lib/media/storage", () => ({ storageBackend: mocks.storageBackend }));
vi.mock("node:fs/promises", () => ({ access: mocks.access }));

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbAll.mockReturnValue([]);
    mocks.access.mockResolvedValue(undefined);
    mocks.isCogDocConfigured.mockReturnValue(false);
    mocks.isS3Configured.mockReturnValue(true);
    mocks.storageBackend.mockReturnValue("s3");
  });

  it("returns a stable degraded response without exposing database failures", async () => {
    const secret = "SQLITE_ERROR SELECT secret FROM users at /srv/isme/private.db";
    mocks.dbAll.mockImplementationOnce(() => {
      throw new Error(secret);
    });

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toEqual({
      ok: false,
      detail: "database unavailable",
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("/srv/isme/private.db");
    expect(serialized).not.toContain("SELECT secret FROM users");
    expect(serialized).not.toContain("SQLITE_ERROR");
  });

  it("preserves the healthy database, CogDoc, and storage response", async () => {
    mocks.isCogDocConfigured.mockReturnValueOnce(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({
      database: { ok: true },
      cogdoc: { ok: true, detail: "configured (readiness in admin)" },
      storage: { ok: true, detail: "s3 (s3, configured)" },
    });
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("keeps optional local storage degradation at HTTP 200", async () => {
    mocks.isS3Configured.mockReturnValueOnce(false);
    mocks.access.mockRejectedValueOnce(new Error("read-only filesystem"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toEqual({ ok: true });
    expect(body.checks.cogdoc).toEqual({ ok: true, detail: "demo mode" });
    expect(body.checks.storage).toEqual({
      ok: false,
      detail: "local uploads directory is not writable",
    });
    expect(mocks.access).toHaveBeenCalledWith(
      path.join(process.cwd(), "public", "uploads"),
      constants.W_OK,
    );
  });
});
