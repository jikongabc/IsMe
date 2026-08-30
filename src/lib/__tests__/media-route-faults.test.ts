import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUpload: vi.fn(),
  listUploads: vi.fn(),
  requireAdmin: vi.fn(),
  tryAuditRequest: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/audit/log", () => ({ tryAuditRequest: mocks.tryAuditRequest }));
vi.mock("@/lib/media/uploads", () => ({
  deleteUpload: mocks.deleteUpload,
  listUploads: mocks.listUploads,
}));

import { DELETE } from "@/app/api/admin/media/route";

describe("media delete route failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
  });

  it("returns a stable 5xx and safe audit when storage deletion is transient", async () => {
    mocks.deleteUpload.mockRejectedValue(
      new Error("s3://private-bucket endpoint=https://secret.example"),
    );
    const request = new Request(
      "http://localhost/api/admin/media?name=media%2Fsafe-key.png",
      { method: "DELETE" },
    );

    const response = await DELETE(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Unable to delete file",
      code: "MEDIA_DELETE_FAILED",
    });
    expect(mocks.tryAuditRequest).toHaveBeenCalledWith(request, {
      action: "media.delete_failed",
      target: "media/safe-key.png",
      ok: false,
      detail: { operation: "storage_delete" },
    });
  });
});
