export type RelatedPostCandidate = {
  slug: string;
  title: string;
  titleEn?: string;
  excerpt: string;
  excerptEn?: string;
  publishedAt: string | null;
  category?: string;
  tags?: string[];
  updatedAt?: string;
};

/** Pure ranking helper — shared tags > same category > recency. */
export function rankRelatedPosts(
  current: { slug: string; category?: string; tags?: string[] },
  others: RelatedPostCandidate[],
  limit = 3,
): RelatedPostCandidate[] {
  const tagSet = new Set((current.tags ?? []).map((t) => t.toLowerCase()));

  return [...others]
    .filter((post) => post.slug !== current.slug)
    .map((post) => {
      const sharedTags = (post.tags ?? []).filter((t) => tagSet.has(t.toLowerCase())).length;
      const sameCategory =
        current.category &&
        post.category &&
        current.category.toLowerCase() === post.category.toLowerCase()
          ? 1
          : 0;
      return { post, score: sharedTags * 10 + sameCategory };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aDate = a.post.publishedAt || a.post.updatedAt || "";
      const bDate = b.post.publishedAt || b.post.updatedAt || "";
      return bDate.localeCompare(aDate);
    })
    .slice(0, limit)
    .map(({ post }) => post);
}
