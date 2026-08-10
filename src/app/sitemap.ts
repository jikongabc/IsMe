import type { MetadataRoute } from "next";
import { getPublicSiteBundle, listPublishedPosts } from "@/lib/content/queries";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().SITE_URL.replace(/\/$/, "");
  const [{ projects }, posts] = await Promise.all([getPublicSiteBundle(), listPublishedPosts()]);

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/projects`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/resume`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/guestbook`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.55 },
    { url: `${base}/knowledge`, changeFrequency: "monthly", priority: 0.9 },
    ...projects.map((project) => ({
      url: `${base}/projects/${project.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt ? new Date(post.updatedAt) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
