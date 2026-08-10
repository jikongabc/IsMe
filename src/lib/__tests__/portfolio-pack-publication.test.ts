import { describe, expect, it } from "vitest";
import {
  createBlankPortfolioPack,
  normalizePortfolioPackPublications,
  type PortfolioPackPost,
  type PortfolioPackProject,
} from "@/lib/portfolio-pack";

function project(overrides: Partial<PortfolioPackProject> = {}): PortfolioPackProject {
  return {
    name: "Evidence-driven project",
    nameEn: "",
    slug: "evidence-project",
    summary: "A concrete case-study summary.",
    summaryEn: "",
    description: "Problem, implementation, trade-off, and reflection.",
    descriptionEn: "",
    contentFormat: "markdown",
    coverUrl: "",
    repositoryUrl: "",
    demoUrl: "",
    techStack: ["TypeScript"],
    role: "Independent developer",
    roleEn: "",
    teamSize: 1,
    duration: "Six weeks",
    durationEn: "",
    metrics: [
      {
        label: "Latency",
        value: "-30%",
        context: "Measured on a fixed set",
        labelEn: "",
        valueEn: "",
        contextEn: "",
      },
    ],
    decisions: [
      {
        title: "Prefer a simple queue",
        tradeoff: "Lower operating cost at the expense of peak throughput.",
        titleEn: "",
        tradeoffEn: "",
      },
    ],
    gallery: [],
    featured: true,
    sortOrder: 0,
    status: "published",
    ...overrides,
  };
}

function post(overrides: Partial<PortfolioPackPost> = {}): PortfolioPackPost {
  return {
    title: "A complete note",
    titleEn: "",
    slug: "complete-note",
    excerpt: "What changed and why.",
    excerptEn: "",
    contentMarkdown: "# Result\n\nA concrete technical retrospective.",
    contentEn: "",
    contentFormat: "markdown",
    coverUrl: "",
    category: "Notes",
    tags: [],
    status: "published",
    publishedAt: null,
    updatedAt: "2026-08-09T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    ...overrides,
  };
}

describe("portfolio pack publication normalization", () => {
  it("demotes weak published projects and reports every missing evidence class", () => {
    const input = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    input.sections.projects = [
      project({ summary: "", role: "", duration: "", teamSize: 0, metrics: [], decisions: [] }),
    ];

    const normalized = normalizePortfolioPackPublications(input);

    expect(normalized.pack.sections.projects[0]?.status).toBe("draft");
    expect(normalized.adjustments).toEqual([
      expect.objectContaining({
        action: "demote-to-draft",
        section: "projects",
        slug: "evidence-project",
        to: "draft",
        reasons: expect.arrayContaining([
          "缺少项目摘要",
          "缺少个人职责",
          "缺少项目周期",
          "缺少团队规模",
          "缺少可核验结果",
          "缺少技术取舍",
        ]),
      }),
    ]);
    expect(input.sections.projects[0]?.status).toBe("published");
  });

  it("keeps an evidence-complete project published", () => {
    const input = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    input.sections.projects = [project()];

    const normalized = normalizePortfolioPackPublications(input);
    expect(normalized.pack.sections.projects[0]?.status).toBe("published");
    expect(normalized.adjustments).toEqual([]);
  });

  it("assigns the transaction time to a complete published post with no timestamp", () => {
    const input = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    input.sections.posts = [post()];

    const normalized = normalizePortfolioPackPublications(
      input,
      "2026-08-10T12:34:56.000Z",
    );

    expect(normalized.pack.sections.posts[0]).toMatchObject({
      status: "published",
      publishedAt: "2026-08-10T12:34:56.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    });
    expect(normalized.adjustments).toEqual([
      expect.objectContaining({ action: "assign-published-at", to: "published" }),
    ]);
  });

  it("demotes an empty published post and clears its publication timestamp", () => {
    const input = createBlankPortfolioPack("2026-08-10T00:00:00.000Z");
    input.sections.posts = [
      post({ excerpt: "", publishedAt: "2026-08-01T00:00:00.000Z" }),
    ];

    const normalized = normalizePortfolioPackPublications(input);
    expect(normalized.pack.sections.posts[0]).toMatchObject({
      status: "draft",
      publishedAt: null,
    });
    expect(normalized.adjustments[0]).toMatchObject({
      action: "demote-to-draft",
      section: "posts",
      reasons: ["缺少文章摘要"],
    });
  });
});
