import { describe, expect, it } from "vitest";
import { estimateReadingMinutes, normalizeContentFormat } from "@/lib/content/format";
import { pickLocalized } from "@/lib/content/localize";

describe("content format", () => {
  it("normalizes format", () => {
    expect(normalizeContentFormat("html")).toBe("html");
    expect(normalizeContentFormat("markdown")).toBe("markdown");
    expect(normalizeContentFormat("weird")).toBe("markdown");
  });

  it("estimates reading time", () => {
    expect(estimateReadingMinutes("")).toBe(0);
    expect(estimateReadingMinutes("word ".repeat(250))).toBeGreaterThanOrEqual(1);
  });
});

describe("localize", () => {
  it("prefers english when locale is en", () => {
    expect(pickLocalized("en", "中文", "English")).toBe("English");
    expect(pickLocalized("en", "中文", "")).toBe("中文");
    expect(pickLocalized("zh", "中文", "English")).toBe("中文");
  });
});
