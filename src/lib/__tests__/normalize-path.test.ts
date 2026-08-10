import { describe, expect, it } from "vitest";
import { normalizePublicPath, normalizeReferrer } from "@/lib/analytics/normalize-path";

describe("normalizePublicPath", () => {
  it("keeps public paths and strips query/hash", () => {
    expect(normalizePublicPath("/blog/hello?x=1#y")).toBe("/blog/hello");
    expect(normalizePublicPath("/")).toBe("/");
  });

  it("rejects admin, api, traversal, and absolute URLs", () => {
    expect(normalizePublicPath("/admin")).toBeNull();
    expect(normalizePublicPath("/api/chat")).toBeNull();
    expect(normalizePublicPath("/../etc/passwd")).toBeNull();
    expect(normalizePublicPath("//evil.com")).toBeNull();
    expect(normalizePublicPath("https://example.com")).toBeNull();
  });
});

describe("normalizeReferrer", () => {
  it("keeps host+path", () => {
    expect(normalizeReferrer("https://news.ycombinator.com/item?id=1")).toBe(
      "news.ycombinator.com/item",
    );
  });
});
