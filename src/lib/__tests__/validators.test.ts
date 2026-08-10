import { describe, expect, it } from "vitest";
import {
  blogPostSchema,
  chatRequestSchema,
  experienceSchema,
  isSafeHttpUrl,
  isSafeImageUrl,
  isSafePublicLink,
  knowledgeBaseSchema,
  profileSchema,
  projectSchema,
  normalizeProjectDecisions,
  normalizeProjectGallery,
  normalizeProjectMetrics,
  socialLinkSchema,
} from "@/lib/validators";

describe("validators", () => {
  it("accepts a valid project slug", () => {
    const parsed = projectSchema.safeParse({
      name: "CogDoc",
      slug: "cog-doc",
      summary: "rag",
      description: "desc",
      coverUrl: "",
      repositoryUrl: "",
      demoUrl: "",
      techStack: ["python"],
      featured: true,
      sortOrder: 0,
      status: "published",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      role: "",
      roleEn: "",
      teamSize: 0,
      duration: "",
      durationEn: "",
      metrics: [],
      decisions: [],
      gallery: [],
    });
  });

  it("accepts bounded bilingual project evidence", () => {
    const parsed = projectSchema.safeParse({
      name: "CogDoc",
      slug: "cogdoc",
      summary: "Grounded answers",
      description: "Details",
      coverUrl: "",
      repositoryUrl: "https://github.com/example/cogdoc",
      demoUrl: "",
      techStack: ["TypeScript"],
      role: "检索与评测",
      roleEn: "Retrieval and evaluation",
      teamSize: "3",
      duration: "8 周",
      durationEn: "8 weeks",
      metrics: [
        {
          label: "引用准确率",
          labelEn: "Citation precision",
          value: "96%",
          context: "50 条问题",
        },
      ],
      decisions: [
        {
          title: "先校验引用",
          tradeoff: "增加延迟以换取可核验性",
        },
      ],
      gallery: [
        {
          src: "/uploads/cogdoc.png",
          alt: "引用评测面板",
          caption: "逐条展示引用状态",
        },
      ],
      featured: true,
      status: "published",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.teamSize).toBe(3);
    expect(parsed.data.metrics[0]).toMatchObject({
      label: "引用准确率",
      value: "96%",
      context: "50 条问题",
      valueEn: "",
    });
  });

  it("rejects unsafe or unbounded project evidence", () => {
    const base = {
      name: "CogDoc",
      slug: "cogdoc",
      summary: "",
      description: "",
      coverUrl: "",
      repositoryUrl: "",
      demoUrl: "",
      techStack: [],
      featured: false,
      status: "draft" as const,
    };

    expect(
      projectSchema.safeParse({
        ...base,
        gallery: [{ src: "javascript:alert(1)", alt: "unsafe", caption: "" }],
      }).success,
    ).toBe(false);
    expect(projectSchema.safeParse({ ...base, teamSize: -1 }).success).toBe(false);
    expect(
      projectSchema.safeParse({
        ...base,
        metrics: Array.from({ length: 21 }, (_, index) => ({
          label: `metric-${index}`,
          value: "1",
          context: "",
        })),
      }).success,
    ).toBe(false);
  });

  it("normalizes evidence arrays element by element", () => {
    expect(normalizeProjectMetrics({ label: "not an array" })).toEqual([]);
    expect(
      normalizeProjectMetrics([
        { label: 7, value: "bad" },
        { label: "Valid", value: "10" },
      ]),
    ).toEqual([
      {
        label: "Valid",
        value: "10",
        context: "",
        labelEn: "",
        valueEn: "",
        contextEn: "",
      },
    ]);
    expect(normalizeProjectDecisions([null, { title: "Missing trade-off" }])).toEqual([]);
    expect(
      normalizeProjectGallery([
        { src: "javascript:alert(1)", alt: "unsafe" },
        { src: "/uploads/safe.png", alt: "Safe" },
      ]),
    ).toEqual([
      {
        src: "/uploads/safe.png",
        alt: "Safe",
        caption: "",
        altEn: "",
        captionEn: "",
      },
    ]);
  });

  it("rejects invalid project slug", () => {
    const parsed = projectSchema.safeParse({
      name: "Bad",
      slug: "Bad_Slug",
      summary: "",
      description: "",
      coverUrl: "",
      repositoryUrl: "",
      demoUrl: "",
      techStack: [],
      featured: false,
      sortOrder: 0,
      status: "draft",
    });
    expect(parsed.success).toBe(false);
  });

  it("defaults experience skills", () => {
    const parsed = experienceSchema.parse({
      type: "competition",
      organization: "Contest",
      role: "Lead",
      startDate: "2024",
      endDate: "2024",
      description: "built stuff",
      sortOrder: 1,
      visible: true,
    });
    expect(parsed.skills).toEqual([]);
  });

  it("validates chat request bounds", () => {
    expect(
      chatRequestSchema.safeParse({
        moduleSlug: "about",
        query: "hello",
        sessionId: null,
      }).success,
    ).toBe(true);

    expect(
      chatRequestSchema.safeParse({
        moduleSlug: "about",
        query: "",
      }).success,
    ).toBe(false);
  });

  it("requires knowledge base slug format", () => {
    expect(
      knowledgeBaseSchema.safeParse({
        name: "About",
        slug: "about-me",
        description: "",
        cogdocKbId: "kb1",
        welcomeMessage: "",
        suggestedQuestions: ["q1"],
        enabled: true,
        sortOrder: 0,
      }).success,
    ).toBe(true);
  });

  it("accepts blog markdown payload", () => {
    const parsed = blogPostSchema.safeParse({
      title: "Hello",
      slug: "hello",
      excerpt: "hi",
      contentMarkdown: "# hi",
      coverUrl: "",
      category: "notes",
      tags: ["rag", "notes"],
      status: "published",
      seoTitle: "",
      seoDescription: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects javascript: and other unsafe URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("//evil.com")).toBe(false);
    expect(isSafeHttpUrl("/uploads/a.jpg")).toBe(true);
    expect(isSafeHttpUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isSafeImageUrl("/uploads/a.jpg")).toBe(true);
    expect(isSafeImageUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isSafeImageUrl("http://cdn.example.com/a.jpg")).toBe(false);

    expect(
      profileSchema.safeParse({
        siteName: "IsMe",
        displayName: "",
        englishName: "",
        role: "",
        headline: "",
        introduction: "",
        avatarUrl: "javascript:alert(1)",
        location: "",
        publicEmail: "",
        availability: "",
      }).success,
    ).toBe(false);

    expect(
      socialLinkSchema.safeParse({
        platform: "web",
        label: "site",
        url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("allows mailto only for public profile links", () => {
    expect(isSafeHttpUrl("mailto:hello@example.com")).toBe(false);
    expect(isSafePublicLink("mailto:hello@example.com")).toBe(true);
    expect(isSafePublicLink("mailto:hello@example.com?body=spam")).toBe(false);
    expect(
      socialLinkSchema.safeParse({
        platform: "email",
        label: "Email",
        url: "mailto:hello@example.com",
      }).success,
    ).toBe(true);
  });
});
