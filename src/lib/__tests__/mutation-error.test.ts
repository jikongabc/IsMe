import { describe, expect, it, vi } from "vitest";
import { mutationErrorResponse } from "@/lib/http/mutation-error";

describe("mutationErrorResponse", () => {
  it("maps SQLite constraint failures to a conflict response", async () => {
    const response = mutationErrorResponse(
      { code: "SQLITE_CONSTRAINT_UNIQUE" },
      "Project",
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Project conflicts with an existing record",
    });
  });

  it("keeps unexpected server details out of the response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = mutationErrorResponse(new Error("private path"), "Post");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Post could not be saved" });
    log.mockRestore();
  });
});
