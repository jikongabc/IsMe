import { describe, expect, it } from "vitest";
import { normalizeLocale, translate } from "@/lib/i18n";

describe("i18n", () => {
  it("normalizes locales", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("zh")).toBe("zh");
    expect(normalizeLocale("fr")).toBe("zh");
  });

  it("translates with variables", () => {
    expect(translate("en", "home.ragReady", { count: 2 })).toContain("2 focused knowledge modules");
    expect(translate("zh", "home.ragReady", { count: 2 })).toContain("2");
    expect(translate("zh", "nav.blog")).toBe("文章");
  });
});
