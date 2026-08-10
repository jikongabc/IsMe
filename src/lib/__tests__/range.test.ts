import { describe, expect, it } from "vitest";
import { fillDailySeries, parseInsightsRange, rangeSinceIso } from "@/lib/analytics/range";

describe("insights range", () => {
  it("parses range tokens", () => {
    expect(parseInsightsRange("7d")).toBe("7d");
    expect(parseInsightsRange("bogus")).toBe("30d");
  });

  it("computes since iso", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    expect(rangeSinceIso("all", now)).toBeNull();
    expect(rangeSinceIso("7d", now)).toBe("2026-07-29T12:00:00.000Z");
  });

  it("fills missing days", () => {
    const filled = fillDailySeries(
      [{ day: "2026-08-04", count: 2 }],
      "2026-08-03T00:00:00.000Z",
      new Date("2026-08-05T12:00:00.000Z"),
    );
    expect(filled.map((r) => r.day)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
    expect(filled.find((r) => r.day === "2026-08-04")?.count).toBe(2);
    expect(filled.find((r) => r.day === "2026-08-03")?.count).toBe(0);
  });
});
