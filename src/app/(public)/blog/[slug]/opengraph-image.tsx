import { getPublishedPostBySlug, getPublicSiteBundle } from "@/lib/content/queries";
import { ogContentType, ogSize, renderOgCard } from "@/lib/og/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Blog post";
export const size = ogSize;
export const contentType = ogContentType;

type Props = { params: Promise<{ slug: string }> };

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const [post, { profile }] = await Promise.all([
    getPublishedPostBySlug(slug),
    getPublicSiteBundle(),
  ]);

  return renderOgCard({
    siteName: profile?.siteName || "IsMe",
    title: post?.title || slug,
    subtitle: post?.excerpt || post?.seoDescription || "blog note",
    eyebrow: "./blog",
  });
}
