import Link from "next/link";
import type { Metadata } from "next";
import { Section } from "@/components/site/Section";
import { estimateReadingMinutes } from "@/lib/content/format";
import { pickLocalized } from "@/lib/content/localize";
import { listPublishedPostTags, listPublishedPosts } from "@/lib/content/queries";
import { translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/get-locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: translate(locale, "blog.title"),
    description: translate(locale, "blog.desc"),
    alternates: {
      canonical: "/blog",
      types: {
        "application/rss+xml": "/feed.xml",
        "application/atom+xml": "/atom.xml",
      },
    },
  };
}

type Props = {
  searchParams: Promise<{ tag?: string; q?: string }>;
};

export default async function BlogPage({ searchParams }: Props) {
  const { tag: rawTag, q: rawQ } = await searchParams;
  const tag = rawTag?.trim() || null;
  const q = rawQ?.trim() || null;
  const [posts, tags, locale] = await Promise.all([
    listPublishedPosts({ tag, q }),
    listPublishedPostTags(),
    getRequestLocale(),
  ]);

  return (
    <Section
      eyebrow={translate(locale, "blog.eyebrow")}
      title={translate(locale, "blog.title")}
      description={translate(locale, "blog.desc")}
    >
      <form
        action="/blog"
        method="get"
        role="search"
        className="portfolio-card mb-6 flex flex-wrap gap-2 !p-3"
      >
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <label htmlFor="blog-search" className="sr-only">
          {translate(locale, "blog.searchPlaceholder")}
        </label>
        <input
          id="blog-search"
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={translate(locale, "blog.searchPlaceholder")}
          autoComplete="off"
          className="min-w-0 flex-[1_1_14rem] rounded-lg border border-line bg-bg-soft px-3 py-2 text-sm text-ink"
        />
        <button type="submit" className="btn-ghost !py-2 text-sm">
          {translate(locale, "blog.search")}
        </button>
      </form>

      <nav
        aria-label={locale === "zh" ? "文章订阅" : "Writing feeds"}
        className="mb-6 flex flex-wrap items-center gap-3 text-xs"
      >
        <Link href="/feed.xml" className="text-ink-faint transition hover:text-accent">
          RSS
        </Link>
        <Link href="/atom.xml" className="text-ink-faint transition hover:text-accent">
          Atom
        </Link>
      </nav>

      {tags.length > 0 ? (
        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href={q ? `/blog?q=${encodeURIComponent(q)}` : "/blog"}
            className={`tag-chip ${!tag ? "border-accent text-accent" : ""}`}
          >
            {translate(locale, "blog.allTags")}
          </Link>
          {tags.map((item) => {
            const active = tag?.toLowerCase() === item.tag.toLowerCase();
            const href = q
              ? `/blog?tag=${encodeURIComponent(item.tag)}&q=${encodeURIComponent(q)}`
              : `/blog?tag=${encodeURIComponent(item.tag)}`;
            return (
              <Link
                key={item.tag}
                href={href}
                className={`tag-chip ${active ? "border-accent text-accent" : ""}`}
              >
                {item.tag}
                <span className="text-ink-faint"> ·{item.count}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {tag ? (
        <p className="mb-2 text-sm text-ink-muted">
          {translate(locale, "blog.filtered", { tag })}
        </p>
      ) : null}
      {q ? (
        <p className="mb-4 text-sm text-ink-muted">
          {translate(locale, "blog.searchResult", { q, count: posts.length })}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <p className="text-ink-muted">{translate(locale, "blog.empty")}</p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {posts.map((post) => {
            const title = pickLocalized(locale, post.title, post.titleEn);
            const excerpt = pickLocalized(locale, post.excerpt, post.excerptEn);
            const body = pickLocalized(locale, post.contentMarkdown, post.contentEn);
            const minutes = estimateReadingMinutes(body || excerpt);
            return (
              <li key={post.id} className="h-full">
                <article className="portfolio-card group flex h-full flex-col">
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

                  <h2 className="mt-3 font-display text-2xl tracking-tight text-ink transition group-hover:text-accent">
                    <Link href={`/blog/${post.slug}`}>{title}</Link>
                  </h2>
                  {excerpt ? (
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                      {excerpt}
                    </p>
                  ) : null}
                  {post.tags?.length ? (
                    <div
                      className="mt-5 flex flex-wrap gap-2"
                      aria-label={locale === "zh" ? "文章标签" : "Tags"}
                    >
                      {post.tags.map((item) => (
                        <span key={item} className="tag-chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <Link
                    href={`/blog/${post.slug}`}
                    className="mt-6 text-sm font-semibold text-accent"
                    aria-label={`${locale === "zh" ? "阅读" : "Read"} ${title}`}
                  >
                    {locale === "zh" ? "阅读全文 →" : "Read article →"}
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
