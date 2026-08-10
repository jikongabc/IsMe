import { describe, expect, it } from "vitest";
import {
  coerceThemeConfig,
  isHexColor,
  isSiteTheme,
  normalizeHexColor,
  normalizeTheme,
  parseThemeConfig,
  SITE_THEMES,
  THEME_COOKIE,
  themeOverrideStyle,
} from "@/lib/theme";
import { resolveUploadName } from "@/lib/media/uploads";
import { appearanceSchema, visitorThemeSchema } from "@/lib/validators";

describe("theme", () => {
  it("exposes five site themes", () => {
    expect(SITE_THEMES).toEqual(["terminal", "ocean", "day", "ember", "slate"]);
    expect(THEME_COOKIE).toBe("isme_theme");
  });

  it("normalizes unknown values to terminal", () => {
    expect(normalizeTheme("ocean")).toBe("ocean");
    expect(normalizeTheme("ember")).toBe("ember");
    expect(normalizeTheme("nope")).toBe("terminal");
    expect(normalizeTheme(null)).toBe("terminal");
  });

  it("parses and coerces theme config", () => {
    expect(isSiteTheme("slate")).toBe(true);
    const parsed = parseThemeConfig({
      enabledThemes: ["day", "bogus", "ember"],
      accent: "#0f8",
      accent2: "not-a-color",
    });
    expect(parsed.enabledThemes).toEqual(["day", "ember"]);
    expect(parsed.accent).toBe("#00ff88");
    expect(parsed.accent2).toBe("");

    const coerced = coerceThemeConfig(parsed, "terminal");
    expect(coerced.enabledThemes).toContain("terminal");
  });

  it("builds accent override CSS variables", () => {
    expect(themeOverrideStyle({ enabledThemes: ["day"], accent: "", accent2: "" })).toBeUndefined();
    const style = themeOverrideStyle({
      enabledThemes: ["day"],
      accent: "#112233",
      accent2: "#445566",
    });
    expect(style?.["--accent"]).toBe("#112233");
    expect(style?.["--accent-2"]).toBe("#445566");
    expect(style?.["--accent-soft"]).toContain("rgba(17, 34, 51");
  });

  it("validates appearance payloads", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(
      appearanceSchema.safeParse({
        theme: "ember",
        defaultLocale: "zh",
        enabledThemes: ["ember", "slate"],
        accent: "#f0a35e",
        accent2: "",
      }).success,
    ).toBe(true);
    expect(
      appearanceSchema.safeParse({
        theme: "ember",
        enabledThemes: ["slate"],
      }).success,
    ).toBe(false);
    expect(visitorThemeSchema.safeParse({ theme: "slate" }).success).toBe(true);
  });
});

describe("upload name safety", () => {
  it("rejects path traversal and odd names", () => {
    expect(resolveUploadName("../etc/passwd")).toBeNull();
    expect(resolveUploadName("a/b.png")).toBeNull();
    expect(resolveUploadName(".hidden")).toBeNull();
    expect(resolveUploadName("ok_image-1.webp")).toBe("ok_image-1.webp");
  });
});
