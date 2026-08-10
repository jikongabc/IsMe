import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogPost, SiteProfile } from "@/lib/db/schema";

const contentMocks = vi.hoisted(() => ({
  getAdminProfile: vi.fn(),
  listPublishedPosts: vi.fn(),
}));

vi.mock("@/lib/content/queries", () => contentMocks);
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ SITE_URL: "https://portfolio.example/" }),
}));

import { buildAtomXml, buildRssXml } from "@/lib/feed/blog-feed";

function profile(overrides: Partial<SiteProfile> = {}): SiteProfile {
  return {
    id: "profile-1",
    siteName: "Lin's <Notes>",
    displayName: "林 & 远",
    englishName: "Lin & Yuan",
    role: "",
    roleEn: "",
    headline: "",
    headlineEn: "",
    introduction: "",
    introductionEn: "",
    avatarUrl: "",
    location: "",
    publicEmail: "",
    availability: "",
    availabilityEn: "",
    theme: "day",
    defaultLocale: "en",
    themeConfig: {},
    adminPasswordHash: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-1",
    title: "A post",
    titleEn: "",
    slug: "a-post",
    excerpt: "Summary",
    excerptEn: "",
    contentMarkdown: "",
    contentEn: "",
    contentFormat: "markdown",
    coverUrl: "",
    category: "Notes",
    tags: [],
    status: "published",
    publishedAt: "2025-01-01T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    createdAt: "2024-12-01T00:00:00.000Z",
    updatedAt: "2025-01-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("blog feeds", () => {
  beforeEach(() => {
    contentMocks.getAdminProfile.mockReset();
    contentMocks.listPublishedPosts.mockReset();
  });

  it("emits a valid feed-level Atom author and uses the newest post update", async () => {
    contentMocks.getAdminProfile.mockResolvedValue(profile());
    contentMocks.listPublishedPosts.mockResolvedValue([
      post({
        id: "newer-publish",
        slug: "newer-publish",
        updatedAt: "2025-02-01T00:00:00.000Z",
      }),
      post({
        id: "newer-edit",
        slug: "newer-edit",
        publishedAt: "2024-06-01T00:00:00.000Z",
        updatedAt: "2025-04-05T12:30:00.000Z",
      }),
    ]);

    const xml = await buildAtomXml();

    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">');
    expect(xml).toContain("<author><name>Lin &amp; Yuan</name></author>");
    expect(xml).toContain("<updated>2025-04-05T12:30:00.000Z</updated>");
    expect(xml).toContain('href="https://portfolio.example/atom.xml" rel="self"');
  });

  it("uses the configured Chinese locale and latest edit in RSS metadata", async () => {
    contentMocks.getAdminProfile.mockResolvedValue(
      profile({ defaultLocale: "zh", updatedAt: "2025-02-01T00:00:00.000Z" }),
    );
    contentMocks.listPublishedPosts.mockResolvedValue([
      post({ updatedAt: "2025-03-04T05:06:07.000Z", tags: ["R&D"] }),
    ]);

    const xml = await buildRssXml();

    expect(xml).toContain("<language>zh-CN</language>");
    expect(xml).toContain("<description>公开文章</description>");
    expect(xml).toContain("<lastBuildDate>Tue, 04 Mar 2025 05:06:07 GMT</lastBuildDate>");
    expect(xml).toContain("<category>R&amp;D</category>");
  });

  it("falls back to the profile update time for an empty Atom feed", async () => {
    contentMocks.getAdminProfile.mockResolvedValue(
      profile({ updatedAt: "2025-06-07T08:09:10.000Z" }),
    );
    contentMocks.listPublishedPosts.mockResolvedValue([]);

    await expect(buildAtomXml()).resolves.toContain(
      "<updated>2025-06-07T08:09:10.000Z</updated>",
    );
  });
});
