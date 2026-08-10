import { describe, expect, it } from "vitest";
import { takeToken } from "@/lib/rate-limit";

describe("rate limit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      expect(takeToken(key, { limit: 3, windowMs: 60_000 })).toBe(true);
    }
    expect(takeToken(key, { limit: 3, windowMs: 60_000 })).toBe(false);
  });
});
