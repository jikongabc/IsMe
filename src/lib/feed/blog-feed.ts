import { getAdminProfile, listPublishedPosts } from "@/lib/content/queries";
import type { BlogPost, SiteProfile } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function siteBase(): string {
  return getEnv().SITE_URL.replace(/\/$/, "");
}

type FeedMeta = {
  title: string;
  author: string;
  language: "en" | "zh-CN";
  description: string;
};

function feedMeta(profile: SiteProfile | null): FeedMeta {
  const language = profile?.defaultLocale === "en" ? "en" : "zh-CN";
  const localizedName =
    language === "en"
      ? profile?.englishName?.trim() || profile?.displayName?.trim()
      : profile?.displayName?.trim() || profile?.englishName?.trim();
  const siteName = profile?.siteName?.trim() || localizedName || "IsMe";

  return {
    title: `${siteName} blog`,
    author: localizedName || siteName,
    language,
    description: language === "en" ? "Published notes" : "公开文章",
  };
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function postUpdatedAt(post: BlogPost): number {
  return (
    timestamp(post.updatedAt) ??
    timestamp(post.publishedAt) ??
    timestamp(post.createdAt) ??
    0
  );
}

function feedUpdatedAt(
  posts: BlogPost[],
  profile: SiteProfile | null,
  generatedAt: number,
): number {
  if (posts.length > 0) {
    return Math.max(...posts.map(postUpdatedAt));
  }
  return timestamp(profile?.updatedAt) ?? generatedAt;
}

export async function buildRssXml(): Promise<string> {
  const base = siteBase();
  const [profile, posts] = await Promise.all([getAdminProfile(), listPublishedPosts()]);
  const meta = feedMeta(profile);
  const updatedAt = feedUpdatedAt(posts, profile, Date.now());
  const items = posts
    .map((post) => {
      const link = `${base}/blog/${post.slug}`;
      const publishedAt =
        timestamp(post.publishedAt) ?? timestamp(post.createdAt) ?? postUpdatedAt(post);
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(publishedAt).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt || post.seoDescription || "")}</description>
      ${(post.tags ?? []).map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n      ")}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(`${base}/blog`)}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${meta.language}</language>
    <lastBuildDate>${new Date(updatedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export async function buildAtomXml(): Promise<string> {
  const base = siteBase();
  const [profile, posts] = await Promise.all([getAdminProfile(), listPublishedPosts()]);
  const meta = feedMeta(profile);
  const updatedAt = feedUpdatedAt(posts, profile, Date.now());

  const entries = posts
    .map((post) => {
      const link = `${base}/blog/${post.slug}`;
      return `  <entry>
    <title>${escapeXml(post.title)}</title>
    <link href="${escapeXml(link)}" rel="alternate"/>
    <id>${escapeXml(link)}</id>
    <updated>${new Date(postUpdatedAt(post)).toISOString()}</updated>
    <summary>${escapeXml(post.excerpt || post.seoDescription || "")}</summary>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${meta.language}">
  <title>${escapeXml(meta.title)}</title>
  <link href="${escapeXml(`${base}/blog`)}" rel="alternate"/>
  <link href="${escapeXml(`${base}/atom.xml`)}" rel="self"/>
  <id>${escapeXml(`${base}/blog`)}</id>
  <updated>${new Date(updatedAt).toISOString()}</updated>
  <author><name>${escapeXml(meta.author)}</name></author>
${entries}
</feed>
`;
}
