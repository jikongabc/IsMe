import { describe, expect, it } from "vitest";
import { rankRelatedPosts } from "@/lib/content/related-posts";

describe("rankRelatedPosts", () => {
  const others = [
    {
      slug: "a",
      title: "A",
      excerpt: "",
      publishedAt: "2024-01-01",
      category: "notes",
      tags: ["rag"],
    },
    {
      slug: "b",
      title: "B",
      excerpt: "",
      publishedAt: "2024-06-01",
      category: "notes",
      tags: ["other"],
    },
    {
      slug: "c",
      title: "C",
      excerpt: "",
      publishedAt: "2024-03-01",
      category: "life",
      tags: ["rag", "sqlite"],
    },
  ];

  it("ranks shared tags first, then same category as a tie-break", () => {
    const ranked = rankRelatedPosts(
      { slug: "current", category: "notes", tags: ["rag"] },
      others,
      3,
    );
    // a: tag+category (11) > c: tag only (10) > b: category only (1)
    expect(ranked.map((p) => p.slug)).toEqual(["a", "c", "b"]);
  });

  it("excludes the current slug", () => {
    const ranked = rankRelatedPosts(
      { slug: "a", category: "notes", tags: ["rag"] },
      others,
      5,
    );
    expect(ranked.every((p) => p.slug !== "a")).toBe(true);
  });
});
