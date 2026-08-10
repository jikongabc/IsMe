import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RichContent } from "@/components/content/RichContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { estimateReadingMinutes, normalizeContentFormat } from "@/lib/content/format";
import { pickLocalized } from "@/lib/content/localize";
import {
  getAdminProfile,
  getPublishedPostBySlug,
  listRelatedPublishedPosts,
} from "@/lib/content/queries";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";
import { articleJsonLd, siteBase } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [post, locale] = await Promise.all([
    getPublishedPostBySlug(slug),
    getRequestLocale(),
  ]);
  if (!post) return { title: "post" };
  const title = pickLocalized(locale, post.seoTitle || post.title, post.titleEn);
  const description = pickLocalized(
    locale,
    post.seoDescription || post.excerpt,
    post.excerptEn,
  );
  const url = `${siteBase()}/blog/${post.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: post.publishedAt || undefined,
      modifiedTime: post.updatedAt,
      images: post.coverUrl ? [{ url: post.coverUrl, alt: title }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, locale, related, profile] = await Promise.all([
    getPublishedPostBySlug(slug),
    getRequestLocale(),
    listRelatedPublishedPosts(slug, 3),
    getAdminProfile(),
  ]);
  if (!post) notFound();

  const title = pickLocalized(locale, post.title, post.titleEn);
  const excerpt = pickLocalized(locale, post.excerpt, post.excerptEn);
  const content = pickLocalized(locale, post.contentMarkdown, post.contentEn);
  const format = normalizeContentFormat(post.contentFormat);
  const minutes = estimateReadingMinutes(content);
  const author = profile?.displayName || profile?.siteName || "IsMe";
  const coverAlt =
    locale === "zh" ? `${title} 文章配图` : `Cover image for ${title}`;

  return (
    <article className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20">
      <JsonLd
        data={articleJsonLd({
          title,
          description: excerpt,
          url: `${siteBase()}/blog/${post.slug}`,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          image: post.coverUrl || undefined,
          authorName: author,
        })}
      />
      <Link href="/blog" className="btn-text text-sm">
        {translate(locale, "blog.back")}
      </Link>

      <header className="mt-8 max-w-3xl">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <span>{post.category || (locale === "zh" ? "笔记" : "Note")}</span>
          {post.publishedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={post.publishedAt}>{post.publishedAt.slice(0, 10)}</time>
            </>
          ) : null}
          {minutes > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{translate(locale, "blog.readTime", { minutes })}</span>
            </>
          ) : null}
        </div>
        <h1 className="mt-3 font-display text-4xl tracking-[-0.035em] text-ink md:text-5xl">
          {title}
        </h1>
        {excerpt ? (
          <p className="mt-5 text-lg leading-relaxed text-ink-muted">{excerpt}</p>
        ) : null}
      </header>

      {post.tags?.length ? (
        <div
          className="mt-5 flex flex-wrap gap-2"
          aria-label={locale === "zh" ? "文章标签" : "Tags"}
        >
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className="tag-chip transition hover:border-accent hover:text-accent"
            >
              {tag}
            </Link>
          ))}
        </div>
      ) : null}
      {post.coverUrl ? (
        // Post cover URLs are managed by the site owner and can be local or remote.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverUrl}
          alt={coverAlt}
          decoding="async"
          className="mt-8 aspect-[16/8] w-full rounded-2xl border border-line object-cover shadow-xl"
        />
      ) : null}
      <RichContent
        content={content}
        format={format}
        className="prose-isme portfolio-card mt-8"
        demoteHeadings
      />

      {related.length > 0 ? (
        <aside className="mt-12 border-t border-line pt-8" aria-labelledby="related-heading">
          <h2 id="related-heading" className="font-display text-2xl text-ink">
            {translate(locale, "blog.related")}
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {related.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/blog/${item.slug}`}
                  className="portfolio-card group block h-full !p-5 transition hover:border-accent"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-lg text-ink group-hover:text-accent">
                      {pickLocalized(locale, item.title, item.titleEn)}
                    </span>
                    {item.publishedAt ? (
                      <time dateTime={item.publishedAt} className="font-mono text-xs text-ink-faint">
                        {item.publishedAt.slice(0, 10)}
                      </time>
                    ) : null}
                  </div>
                  {pickLocalized(locale, item.excerpt, item.excerptEn) ? (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                      {pickLocalized(locale, item.excerpt, item.excerptEn)}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}
