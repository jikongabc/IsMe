import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  saveMedia: vi.fn(),
  tryAuditRequest: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/audit/log", () => ({ tryAuditRequest: mocks.tryAuditRequest }));
vi.mock("@/lib/media/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/registry")>()),
  saveMedia: mocks.saveMedia,
}));

import { POST } from "@/app/api/admin/upload/route";
import { MediaRegistryError } from "@/lib/media/registry";
import { MediaObjectAlreadyExistsError } from "@/lib/media/storage";

function uploadRequest(): Request {
  const form = new FormData();
  form.set("file", new File([
    new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x00,
    ]),
  ], "avatar.png", { type: "image/png" }));
  return new Request("http://localhost/api/admin/upload", { method: "POST", body: form });
}

describe("upload route storage failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
  });

  it("retries only a create-only collision with a newly generated key", async () => {
    mocks.saveMedia
      .mockRejectedValueOnce(new MediaObjectAlreadyExistsError())
      .mockResolvedValueOnce({
        key: "media/fresh.png",
        name: "fresh.png",
        url: "https://cdn.example.test/media/fresh.png",
        bytes: 8,
        contentType: "image/png",
        storage: "s3",
      });

    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    expect(mocks.saveMedia).toHaveBeenCalledTimes(2);
    expect(mocks.saveMedia.mock.calls[0]?.[0]).not.toBe(mocks.saveMedia.mock.calls[1]?.[0]);
    expect(mocks.tryAuditRequest).toHaveBeenCalledWith(expect.any(Request), {
      action: "upload.create",
      target: "media/fresh.png",
      detail: { type: "image/png", storage: "s3" },
    });
  });

  it("returns and audits only safe fields when compensation needs reconciliation", async () => {
    mocks.saveMedia.mockRejectedValue(new MediaRegistryError(
      "MEDIA_RECONCILE_REQUIRED",
      "media/safe-key.png",
      "s3",
    ));

    const response = await POST(uploadRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Unable to save upload",
      code: "MEDIA_RECONCILE_REQUIRED",
    });
    expect(mocks.tryAuditRequest).toHaveBeenCalledWith(expect.any(Request), {
      action: "upload.reconcile_required",
      target: "media/safe-key.png",
      ok: false,
      detail: { storage: "s3", operation: "registration_compensation" },
    });
  });

  it("never returns a raw storage or database error", async () => {
    mocks.saveMedia.mockRejectedValue(
      new Error("s3://private-bucket /srv/private/data.db secret.example"),
    );

    const response = await POST(uploadRequest());
    const body = JSON.stringify(await response.json());
    expect(response.status).toBe(500);
    expect(body).toBe(JSON.stringify({
      error: "Unable to save upload",
      code: "MEDIA_UPLOAD_FAILED",
    }));
    expect(body).not.toContain("private-bucket");
    expect(body).not.toContain("/srv/private");
    expect(body).not.toContain("secret.example");
  });
});
