import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { CogDocAdminError } from "@/lib/cogdoc/admin-client";

describe("cogdoc admin errors", () => {
  it("carries status and code", () => {
    const err = new CogDocAdminError(503, "COGDOC_NOT_CONFIGURED", "missing url");
    expect(err.status).toBe(503);
    expect(err.code).toBe("COGDOC_NOT_CONFIGURED");
    expect(err.message).toBe("CogDoc is not configured");
  });
});
