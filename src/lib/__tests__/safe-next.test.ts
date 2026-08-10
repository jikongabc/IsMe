import { describe, expect, it } from "vitest";
import { safeAdminNextPath } from "@/lib/auth/safe-next";

describe("safeAdminNextPath", () => {
  it("allows admin-relative paths", () => {
    expect(safeAdminNextPath("/admin/posts")).toBe("/admin/posts");
    expect(safeAdminNextPath("/admin")).toBe("/admin");
  });

  it("rejects open redirects and non-admin paths", () => {
    expect(safeAdminNextPath("https://evil.com")).toBe("/admin");
    expect(safeAdminNextPath("//evil.com")).toBe("/admin");
    expect(safeAdminNextPath("/guestbook")).toBe("/admin");
    expect(safeAdminNextPath(null)).toBe("/admin");
  });
});
