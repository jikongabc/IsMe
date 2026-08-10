import { describe, expect, it } from "vitest";
import { demoteHtmlHeadings } from "@/components/content/RichContent";

describe("demoteHtmlHeadings", () => {
  it("preserves one page-level h1 by shifting nested content headings", () => {
    expect(demoteHtmlHeadings("<h1>Title</h1><h2 id=\"a\">Part</h2><h6>Leaf</h6>"))
      .toBe("<h2>Title</h2><h3 id=\"a\">Part</h3><h6>Leaf</h6>");
  });
});
