import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/content/queries", () => ({
  getAdminProfile: vi.fn(async () => ({
    displayName: "Alex River",
    englishName: "Alex River",
    siteName: "IsMe Demo",
    role: "工程师",
    roleEn: "Engineer",
    headline: "在做事",
    headlineEn: "Building things",
    introduction: "你好",
    introductionEn: "Hello",
    location: "Remote",
    availability: "开放",
    availabilityEn: "Open",
    publicEmail: "hello@example.com",
  })),
  listAdminSocialLinks: vi.fn(async () => [
    { id: "1", label: "GitHub", url: "https://github.com/example", visible: true },
  ]),
  listAdminFocusAreas: vi.fn(async () => [
    {
      id: "f1",
      title: "RAG",
      titleEn: "RAG EN",
      description: "retrieval",
      descriptionEn: "retrieval en",
      tags: ["LangGraph"],
      visible: true,
    },
  ]),
  listAdminExperiences: vi.fn(async () => [
    {
      id: "e1",
      type: "work",
      organization: "Lab",
      organizationEn: "Lab EN",
      role: "Intern",
      roleEn: "Intern EN",
      startDate: "2024",
      endDate: "2024",
      description: "Shipped tools",
      descriptionEn: "Shipped tools EN",
      skills: ["TS"],
      visible: true,
    },
  ]),
  listAdminProjects: vi.fn(async () => [
    {
      id: "p1",
      name: "CogDoc",
      nameEn: "CogDoc EN",
      slug: "cogdoc",
      summary: "RAG console",
      summaryEn: "RAG console EN",
      description: "Details ".repeat(2000),
      descriptionEn: "Details EN ".repeat(2000),
      techStack: ["Python"],
      role: "检索与评测",
      roleEn: "Retrieval and evaluation",
      teamSize: 3,
      duration: "8 周",
      durationEn: "8 weeks",
      metrics: [
        {
          label: "引用准确率",
          labelEn: "Citation precision",
          value: "96%",
          valueEn: "96%",
          context: "50 条评测问题",
          contextEn: "50 evaluation questions",
        },
      ],
      decisions: [
        {
          title: "先校验引用",
          titleEn: "Validate citations first",
          tradeoff: "增加延迟以换取可核验性",
          tradeoffEn: "Trade latency for verifiability",
        },
      ],
      gallery: [
        {
          src: "/uploads/cogdoc.png",
          alt: "引用评测面板",
          altEn: "Citation evaluation dashboard",
          caption: "展示逐条引用状态",
          captionEn: "Shows citation status per claim",
        },
      ],
      repositoryUrl: "https://github.com/example/cogdoc",
      demoUrl: "",
      status: "published",
    },
  ]),
  listAdminPosts: vi.fn(async () => [
    {
      id: "b1",
      title: "Why KB",
      titleEn: "Why KB EN",
      slug: "why-kb",
      excerpt: "note",
      excerptEn: "note en",
      contentMarkdown: "# Why\n\nBecause.",
      contentEn: "# Why EN\n\nBecause EN.",
      category: "Notes",
      status: "published",
    },
  ]),
}));

describe("buildSiteSyncCards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds primary and EN cards", async () => {
    const { buildSiteSyncCards } = await import("@/lib/content/sync-cards");
    const cards = await buildSiteSyncCards();
    const keys = cards.map((c) => c.key);
    expect(keys).toContain("profile");
    expect(keys).toContain("profile:en");
    expect(keys).toContain("focus:f1");
    expect(keys).toContain("focus:f1:en");
    expect(keys).toContain("experience:e1");
    expect(keys).toContain("experience:e1:en");
    expect(keys).toContain("project:cogdoc");
    expect(keys).toContain("project:cogdoc:en");
    expect(keys).toContain("post:why-kb");
    expect(keys).toContain("post:why-kb:en");
    const projectCard = cards.find((c) => c.key === "project:cogdoc");
    expect(projectCard?.text).toContain("CogDoc");
    expect(projectCard?.text).toContain("引用准确率: 96%");
    expect(projectCard?.text).toContain("关键技术取舍");
    expect(projectCard?.text).toContain("引用评测面板");
    expect(projectCard?.text).toContain("Repository: https://github.com/example/cogdoc");
    expect(projectCard?.text.length).toBeLessThanOrEqual(6000);
    expect(cards.find((c) => c.key === "project:cogdoc:en")?.text).toContain(
      "Citation precision: 96%",
    );
    expect(cards.find((c) => c.key === "project:cogdoc:en")?.text).toContain(
      "Citation evaluation dashboard",
    );
    expect(cards.find((c) => c.key === "post:why-kb:en")?.text).toContain("Why EN");
  });
});
