import { describe, expect, it } from "vitest";
import { normalizeQuery } from "@/lib/analytics/normalize-query";

describe("normalizeQuery", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeQuery("  What   is   CogDoc?  ")).toBe("what is cogdoc");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeQuery("Who are you？")).toBe("who are you");
    expect(normalizeQuery("skills!")).toBe("skills");
  });
});
