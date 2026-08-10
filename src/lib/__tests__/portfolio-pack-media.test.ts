import { describe, expect, it } from "vitest";
import {
  collectPortfolioPackMediaReferences,
  createBlankPortfolioPack,
  safeParsePortfolioPack,
} from "@/lib/portfolio-pack";

describe("portfolio pack media references", () => {
  it("collects explicit and Markdown/HTML image references without exposing URL credentials", () => {
    const pack = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    pack.sections.profile.avatarUrl = "/uploads/avatar.png?cache=1";
    pack.sections.projects.push({
      name: "Case study",
      nameEn: "",
      slug: "case-study",
      summary: "Summary",
      summaryEn: "",
      description:
        '![local](/uploads/diagram.png)\n<img src="https://token@example.org/screens/one.png?signature=secret#part">',
      descriptionEn: "",
      contentFormat: "markdown",
      coverUrl: "https://cdn.example.org/cover.png?temporary=token",
      repositoryUrl: "",
      demoUrl: "",
      techStack: [],
      role: "Owner",
      roleEn: "",
      teamSize: 1,
      duration: "One month",
      durationEn: "",
      metrics: [],
      decisions: [],
      gallery: [],
      featured: false,
      sortOrder: 0,
      status: "draft",
    });

    const scan = collectPortfolioPackMediaReferences(pack);

    expect(scan.truncated).toBe(false);
    expect(scan.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "local-upload", url: "/uploads/avatar.png" }),
        expect.objectContaining({ kind: "local-upload", url: "/uploads/diagram.png" }),
        expect.objectContaining({ kind: "external", url: "https://cdn.example.org/cover.png" }),
        expect.objectContaining({ kind: "external", url: "https://example.org/screens/one.png" }),
      ]),
    );
    expect(JSON.stringify(scan)).not.toContain("signature");
    expect(JSON.stringify(scan)).not.toContain("token@");
  });

  it("marks a bounded result as truncated instead of claiming full coverage", () => {
    const pack = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    pack.sections.posts.push({
      title: "Images",
      titleEn: "",
      slug: "images",
      excerpt: "",
      excerptEn: "",
      contentMarkdown:
        "![](/uploads/a.png)\n![](/uploads/b.png)\n![](/uploads/c.png)",
      contentEn: "",
      contentFormat: "markdown",
      coverUrl: "",
      category: "",
      tags: [],
      status: "draft",
      publishedAt: null,
      updatedAt: "2026-08-10T00:00:00.000Z",
      seoTitle: "",
      seoDescription: "",
    });

    const scan = collectPortfolioPackMediaReferences(pack, { maxReferences: 2 });
    expect(scan.references).toHaveLength(2);
    expect(scan.truncated).toBe(true);
  });

  it("rejects whitespace, control characters, traversal, and malformed escapes in relative URLs", () => {
    for (const avatarUrl of [
      "/avatar pic.png",
      "/avatar\n.png",
      "/../secret.png",
      "/%2e%2e/secret.png",
      "/%ZZ/image.png",
    ]) {
      const pack = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
      pack.sections.profile.avatarUrl = avatarUrl;
      expect(safeParsePortfolioPack(pack).success, avatarUrl).toBe(false);
    }

    const valid = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    valid.sections.profile.avatarUrl = "/uploads/avatar.png?v=2#square";
    expect(safeParsePortfolioPack(valid).success).toBe(true);
  });
});
