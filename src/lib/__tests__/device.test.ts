import { describe, expect, it } from "vitest";
import { classifyDevice, detectCountry } from "@/lib/analytics/device";

describe("classifyDevice", () => {
  it("detects mobile / tablet / desktop / bot", () => {
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(
      "mobile",
    );
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe(
      "desktop",
    );
    expect(classifyDevice("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe("bot");
  });
});

describe("detectCountry", () => {
  it("reads CDN country headers", () => {
    expect(detectCountry(new Headers({ "cf-ipcountry": "jp" }))).toBe("JP");
    expect(detectCountry(new Headers({ "x-vercel-ip-country": "US" }))).toBe("US");
    expect(detectCountry(new Headers({ "cf-ipcountry": "XX" }))).toBe("");
    expect(detectCountry(new Headers())).toBe("");
  });
});
