import { describe, expect, it } from "vitest";
import { findPlaceholderMatches } from "@/lib/readiness/placeholders";
import { extractRichContentHrefs } from "@/lib/readiness/rich-content-links";
import {
  applyKnowledgeHealth,
  applyLinkChecks,
  buildReadinessReport,
  calculateReadinessScore,
  collectReadinessLinks,
} from "@/lib/readiness/report";
import type { ReadinessInput, ReadinessItem } from "@/lib/readiness/types";

function cleanInput(): ReadinessInput {
  return {
    profile: {
      siteName: "Lin's Engineering Notes",
      displayName: "林知远",
      englishName: "Zhiyuan Lin",
      role: "全栈产品工程师",
      roleEn: "Full-stack product engineer",
      headline: "把复杂的知识工作流做成可验证、可维护的产品。",
      headlineEn: "I turn complex knowledge workflows into verifiable products.",
      introduction:
        "我负责从需求澄清、数据建模到前端交互和上线运维的完整交付，并持续用真实使用数据复盘技术取舍。",
      introductionEn:
        "I own delivery from product framing and data modeling through interface design and production operations.",
      avatarUrl: "/uploads/portrait.png",
      location: "上海",
      publicEmail: "hello@portfolio.dev",
      availability: "开放全栈与 AI 产品工程岗位",
      availabilityEn: "Open to full-stack and AI product engineering roles",
      defaultLocale: "zh",
    },
    socialLinks: [
      {
        id: "social_github",
        platform: "github",
        label: "GitHub",
        url: "https://github.com/lin-zhiyuan/portfolio",
        visible: true,
      },
    ],
    focusAreas: [
      {
        id: "focus_product",
        title: "AI 产品工程",
        titleEn: "AI product engineering",
        description: "从检索质量到完整产品体验。",
        descriptionEn: "From retrieval quality to the complete product experience.",
        tags: ["TypeScript", "RAG"],
        visible: true,
      },
    ],
    experiences: [
      {
        id: "exp_studio",
        type: "work",
        organization: "深海工作室",
        organizationEn: "Deep Sea Studio",
        role: "产品工程师",
        roleEn: "Product engineer",
        startDate: "2024-01",
        endDate: "至今",
        description: "负责知识工作台的产品设计、全栈实现和发布质量。",
        descriptionEn: "Owned product design, implementation, and release quality.",
        skills: ["TypeScript", "SQLite"],
        visible: true,
      },
    ],
    projects: [
      {
        id: "project_signal",
        name: "Signal Desk",
        nameEn: "Signal Desk",
        slug: "signal-desk",
        summary: "帮助研究团队核验检索证据并复盘回答质量的知识工作台。",
        summaryEn: "A knowledge desk for verifying evidence and reviewing answer quality.",
        description:
          "项目从研究团队无法复盘错误回答的问题出发。我将检索、生成、引用校验和人工反馈拆成明确阶段，并保存每一步证据。为了让上线运维保持简单，首版选择单机事务存储，同时通过边界清晰的数据访问层保留未来迁移空间。最终交付包括管理后台、公开问答与逐请求质量追踪。",
        descriptionEn:
          "The project makes retrieval, generation, citation validation, and feedback explicit so every incorrect answer can be diagnosed. It ships with an admin console, public Q&A, and request-level quality traces.",
        contentFormat: "markdown",
        coverUrl: "/uploads/signal-cover.png",
        repositoryUrl: "https://github.com/lin-zhiyuan/signal-desk",
        demoUrl: "https://signal.portfolio.dev",
        techStack: ["Next.js", "TypeScript", "SQLite"],
        role: "独立产品与工程负责人",
        roleEn: "Independent product and engineering lead",
        teamSize: 1,
        duration: "12 周",
        durationEn: "12 weeks",
        metrics: [
          {
            label: "可追踪回答",
            value: "100%",
            context: "每次回答保留检索与引用证据。",
            labelEn: "Traceable answers",
            valueEn: "100%",
            contextEn: "Every answer retains retrieval and citation evidence.",
          },
        ],
        decisions: [
          {
            title: "优先保证引用可核验",
            tradeoff: "接受一次额外校验延迟，换取证据不足时的诚实降级。",
            titleEn: "Prioritize verifiable citations",
            tradeoffEn: "Accept validation latency for honest degradation.",
          },
        ],
        gallery: [
          {
            src: "/uploads/signal-evidence.png",
            alt: "回答证据面板",
            caption: "检索证据与引用校验结果。",
            altEn: "Answer evidence panel",
            captionEn: "Retrieved evidence and citation validation.",
          },
        ],
        featured: true,
        status: "published",
      },
    ],
    posts: [
      {
        id: "post_citations",
        title: "如何验证知识问答中的引用",
        titleEn: "How to validate citations in knowledge Q&A",
        slug: "validate-citations",
        excerpt: "把引用格式与证据支持拆开评测。",
        excerptEn: "Evaluate citation formatting separately from evidence support.",
        contentMarkdown: "# 引用校验\n\n先检查文档存在，再验证引用片段是否支持回答中的具体主张。",
        contentEn: "# Citation validation\n\nCheck document existence and claim support separately.",
        contentFormat: "markdown",
        coverUrl: "",
        category: "Engineering",
        tags: ["RAG", "Evaluation"],
        status: "published",
        seoTitle: "知识问答引用校验方法",
        seoDescription: "从文档存在性、片段相关性和主张支持度三个层次检查引用。",
      },
    ],
    knowledgeBases: [
      {
        id: "kb_career",
        name: "关于我的工程经历",
        nameEn: "My engineering experience",
        slug: "career",
        description: "询问职责、项目取舍与复盘。",
        descriptionEn: "Ask about ownership, trade-offs, and lessons learned.",
        cogdocKbId: "career-knowledge",
        welcomeMessage: "可以从项目职责、技术取舍或交付结果开始提问。",
        welcomeMessageEn: "Ask about ownership, technical decisions, or outcomes.",
        suggestedQuestions: ["Signal Desk 为什么拆分引用校验？"],
        suggestedQuestionsEn: ["Why does Signal Desk validate citations separately?"],
        enabled: true,
      },
    ],
    env: {
      nodeEnv: "production",
      siteUrl: "https://portfolio.dev",
      adminEnvironmentReady: true,
      adminCredentialReady: true,
      adminCredentialSource: "environment",
      sessionSecretReady: true,
      cogdocApiUrlConfigured: true,
      cogdocApiKeyConfigured: true,
      storageMode: "s3",
    },
  };
}

describe("readiness placeholder detection", () => {
  it("recognizes the documented English, Chinese, URL, and credential markers", () => {
    const matches = findPlaceholderMatches([
      "Alex River",
      "IsMe Demo",
      "hello@example.com",
      "https://portfolio.example.org",
      "Example University / 示例大学",
      "Northwind Labs",
      "https://github.com/example/isme",
      "replace-with-a-strong-password",
      "http://localhost:3000",
      "这是 IsMe 模板的占位内容。",
    ]);

    expect(matches.map((match) => match.id)).toEqual(
      expect.arrayContaining([
        "alex-river",
        "isme-demo",
        "example-domain",
        "example-university",
        "northwind-labs",
        "github-example",
        "replace-with",
        "local-address",
        "placeholder-copy",
      ]),
    );
  });

  it("does not treat legitimate template discussion or words containing demo as placeholders", () => {
    expect(
      findPlaceholderMatches(
        "I built a release gate that blocks sharing while placeholder data remains and hosted a demo site for reviewers. 我为团队设计了模板系统，并演示了迁移过程。demoed once",
      ),
    ).toEqual([]);
  });
});

describe("buildReadinessReport", () => {
  it("holds a complete local portfolio at link verification until the network scan runs", () => {
    const report = buildReadinessReport(cleanInput(), "2026-08-10T10:00:00.000Z");

    expect(report.generatedAt).toBe("2026-08-10T10:00:00.000Z");
    expect(report.readyToShare).toBe(false);
    expect(report.counts.blocker).toBe(0);
    expect(report.items.find((item) => item.id === "links-audit")?.status).toBe("warning");
    expect(report.items.find((item) => item.id === "knowledge-provider")?.status).toBe("warning");
    expect(report.score).toBeGreaterThanOrEqual(95);
  });

  it("marks a complete portfolio ready only after links and CogDoc health pass", () => {
    const localReport = applyKnowledgeHealth(buildReadinessReport(cleanInput()), {
      ok: true,
      status: 200,
    });
    const checked = applyLinkChecks(
      localReport,
      [
        {
          url: "https://portfolio.dev/",
          label: "Site",
          source: "deployment:site-url",
          status: "ok",
          httpStatus: 204,
        },
      ],
      1,
    );

    expect(checked.counts.blocker).toBe(0);
    expect(checked.items.find((item) => item.id === "links-audit")?.status).toBe("pass");
    expect(checked.readyToShare).toBe(true);
  });

  it("keeps an enabled knowledge module pending until the trusted health probe passes", () => {
    const localReport = buildReadinessReport(cleanInput());
    const linksOnly = applyLinkChecks(localReport, [
      {
        url: "https://portfolio.dev/",
        label: "Site",
        source: "deployment:site-url",
        status: "ok",
        httpStatus: 200,
      },
    ]);
    const failedHealth = applyKnowledgeHealth(linksOnly, { ok: false, status: 503 });

    expect(linksOnly.readyToShare).toBe(false);
    expect(linksOnly.items.find((item) => item.id === "knowledge-provider")?.status).toBe(
      "warning",
    );
    expect(failedHealth.readyToShare).toBe(false);
    expect(failedHealth.items.find((item) => item.id === "knowledge-provider")).toMatchObject({
      status: "blocker",
      detail: expect.stringContaining("HTTP 503"),
    });
  });

  it("uses public-page fallback semantics for an English-default portfolio", () => {
    const input = cleanInput();
    input.profile!.defaultLocale = "en";
    input.profile!.englishName = "";
    input.profile!.roleEn = "";
    input.profile!.headlineEn = "";
    input.profile!.introductionEn = "";
    input.experiences[0].organizationEn = "";
    input.experiences[0].roleEn = "";
    input.experiences[0].descriptionEn = "";
    input.projects[0].summaryEn = "";
    input.projects[0].descriptionEn = "";
    input.projects[0].roleEn = "";
    input.projects[0].durationEn = "";
    input.projects[0].metrics[0].labelEn = "";
    input.projects[0].metrics[0].valueEn = "";
    input.projects[0].decisions[0].titleEn = "";
    input.projects[0].decisions[0].tradeoffEn = "";
    input.posts[0].titleEn = "";
    input.posts[0].excerptEn = "";
    input.posts[0].contentEn = "";
    input.knowledgeBases[0].nameEn = "";
    input.knowledgeBases[0].descriptionEn = "";
    input.knowledgeBases[0].welcomeMessageEn = "";
    input.knowledgeBases[0].suggestedQuestionsEn = [];

    const report = buildReadinessReport(input);
    const coreIds = [
      "identity-narrative",
      "experience-completeness",
      "portfolio-signal-desk-narrative",
      "portfolio-signal-desk-ownership",
      "portfolio-signal-desk-evidence",
      "content-completeness",
      "knowledge-completeness",
    ];

    coreIds.forEach((id) => {
      expect(report.items.find((item) => item.id === id)?.status, id).not.toBe("blocker");
    });
    expect(report.items.find((item) => item.id === "identity-bilingual")?.status).toBe(
      "warning",
    );
    expect(report.items.find((item) => item.id === "portfolio-bilingual")?.status).toBe(
      "warning",
    );
    expect(report.counts.blocker).toBe(0);
  });

  it("rejects a knowledge suggestion array that only contains blanks", () => {
    const input = cleanInput();
    input.knowledgeBases[0].suggestedQuestions = ["   "];
    const report = buildReadinessReport(input);

    expect(report.items.find((item) => item.id === "knowledge-completeness")?.status).toBe(
      "blocker",
    );
  });

  it("aggregates placeholder fields per public entity and keeps subjects actionable", () => {
    const input = cleanInput();
    input.profile!.siteName = "IsMe Demo";
    input.profile!.displayName = "Alex River";
    input.profile!.publicEmail = "hello@example.com";
    input.socialLinks[0].url = "https://github.com/example/isme";
    input.experiences = [
      { ...input.experiences[0], id: "exp_one", organization: "Northwind Labs" },
      {
        ...input.experiences[0],
        id: "exp_two",
        organization: "示例大学",
        organizationEn: "Example University",
      },
    ];
    input.projects[0].repositoryUrl = "https://github.com/example/signal-desk";
    input.knowledgeBases[0].suggestedQuestions = ["Alex River 现在在关注什么？"];

    const report = buildReadinessReport(input, "2026-08-10T10:00:00.000Z");
    const placeholderBlockers = report.items.filter(
      (current) => current.status === "blocker" && current.id.endsWith("originality"),
    );

    expect(report.readyToShare).toBe(false);
    expect(report.items.filter((current) => current.id === "identity-originality")).toHaveLength(1);
    expect(
      placeholderBlockers.filter((current) => current.category === "experience").map((item) => item.subject),
    ).toEqual(expect.arrayContaining(["Northwind Labs", "示例大学"]));
    expect(
      placeholderBlockers.find((current) => current.category === "portfolio")?.subject,
    ).toBe("Signal Desk");
    expect(
      placeholderBlockers.find((current) => current.category === "knowledge")?.subject,
    ).toBe("关于我的工程经历");
  });

  it("blocks published projects that have neither narrative nor interview evidence", () => {
    const input = cleanInput();
    input.projects[0] = {
      ...input.projects[0],
      summary: "",
      description: "",
      metrics: [],
      decisions: [],
    };

    const report = buildReadinessReport(input);
    expect(report.items.find((item) => item.id === "portfolio-signal-desk-narrative")?.status).toBe(
      "blocker",
    );
    expect(report.items.find((item) => item.id === "portfolio-signal-desk-evidence")?.status).toBe(
      "blocker",
    );
    expect(report.readyToShare).toBe(false);
  });

  it("blocks an incomplete public experience instead of counting a shell as a résumé", () => {
    const input = cleanInput();
    input.experiences[0].role = "";
    input.experiences[0].roleEn = "";
    input.experiences[0].startDate = "";
    input.experiences[0].description = "";
    input.experiences[0].descriptionEn = "";

    const report = buildReadinessReport(input);
    expect(report.items.find((item) => item.id === "experience-completeness")?.status).toBe(
      "blocker",
    );
  });

  it("blocks an empty published article but treats missing SEO copy as an optimization", () => {
    const input = cleanInput();
    input.posts[0].excerpt = "";
    input.posts[0].excerptEn = "";
    input.posts[0].contentMarkdown = "";
    input.posts[0].contentEn = "";
    input.posts[0].seoTitle = "";
    input.posts[0].seoDescription = "";

    const report = buildReadinessReport(input);
    expect(report.items.find((item) => item.id === "content-completeness")?.status).toBe(
      "blocker",
    );
    expect(report.items.find((item) => item.id === "content-seo")?.status).toBe("warning");
  });

  it("blocks published cases until ownership, outcomes, and trade-offs are all explicit", () => {
    const input = cleanInput();
    input.projects[0] = {
      ...input.projects[0],
      role: "",
      duration: "",
      teamSize: 0,
      decisions: [],
    };

    const report = buildReadinessReport(input);
    expect(report.items.find((item) => item.id === "portfolio-signal-desk-ownership")?.status)
      .toBe("blocker");
    expect(report.items.find((item) => item.id === "portfolio-signal-desk-evidence")?.status)
      .toBe("blocker");
    expect(report.readyToShare).toBe(false);
  });

  it("reports only unsafe credential names, never a credential value", () => {
    const input = cleanInput();
    input.env.adminCredentialReady = false;
    input.env.sessionSecretReady = false;
    const report = buildReadinessReport(input);
    const gate = report.items.find((item) => item.id === "deployment-credentials");

    expect(gate).toMatchObject({ status: "blocker" });
    expect(gate?.detail).toContain("ADMIN_PASSWORD");
    expect(gate?.detail).toContain("SESSION_SECRET");
    expect(JSON.stringify(report)).not.toContain("replace-with-a-strong-password");
  });

  it.each([
    ["https://user:secret@portfolio.dev", "用户名或密码"],
    ["https://portfolio.dev:8443", "自定义端口"],
    ["https://portfolio.dev/work", "根路径"],
    ["https://portfolio.dev/?preview=1", "查询参数"],
    ["https://portfolio.dev/#work", "查询参数"],
    ["https://203.0.113.10", "域名"],
    ["https://[2001:db8::1]", "域名"],
    ["https://portfolio.example", "域名"],
    ["https://example.org", "占位"],
    ["https://resume.example.net", "占位"],
  ])("rejects SITE_URL shapes that cannot be a stable canonical origin: %s", (siteUrl, reason) => {
    const input = cleanInput();
    input.env.siteUrl = siteUrl;
    const gate = buildReadinessReport(input).items.find(
      (current) => current.id === "deployment-site-url",
    );

    expect(gate?.status).toBe("blocker");
    expect(gate?.detail).toContain(reason);
  });

  it("never declares a development-mode report ready for résumé sharing", () => {
    const input = cleanInput();
    input.env.nodeEnv = "development";
    const local = buildReadinessReport(input);
    const healthy = applyKnowledgeHealth(local, { ok: true, status: 200 });
    const checked = applyLinkChecks(healthy, [
      {
        url: "https://portfolio.dev/",
        label: "Site",
        source: "deployment:site-url",
        status: "ok",
        httpStatus: 200,
      },
    ]);

    expect(checked.items.find((item) => item.id === "deployment-runtime")?.status).toBe(
      "blocker",
    );
    expect(checked.readyToShare).toBe(false);
  });
});

describe("readiness scoring and link composition", () => {
  it("awards full points for pass, half for warning, and none for blockers", () => {
    const items: ReadinessItem[] = [
      {
        id: "pass",
        category: "identity",
        status: "pass",
        title: "pass",
        detail: "pass",
        weight: 4,
      },
      {
        id: "warning",
        category: "content",
        status: "warning",
        title: "warning",
        detail: "warning",
        weight: 2,
      },
      {
        id: "blocker",
        category: "deployment",
        status: "blocker",
        title: "blocker",
        detail: "blocker",
        weight: 4,
      },
    ];
    expect(calculateReadinessScore(items)).toBe(50);
  });

  it("collects public targets once, resolves local media, and skips mailto and drafts", () => {
    const input = cleanInput();
    input.socialLinks.push(
      {
        id: "social_mail",
        platform: "email",
        label: "Email",
        url: "mailto:hello@portfolio.dev",
        visible: true,
      },
      {
        id: "social_hidden",
        platform: "website",
        label: "Hidden",
        url: "https://hidden.portfolio.dev",
        visible: false,
      },
      {
        id: "social_credentials",
        platform: "website",
        label: "Credential URL",
        url: "https://user:secret@links.portfolio.dev/private",
        visible: true,
      },
    );
    input.projects.push({
      ...input.projects[0],
      id: "project_draft",
      slug: "draft-project",
      status: "draft",
      repositoryUrl: "https://github.com/lin-zhiyuan/draft",
    });
    input.projects[0].gallery.push({
      src: "/uploads/portrait.png",
      alt: "Duplicate avatar URL",
      caption: "",
    });
    input.projects[0].demoUrl = "not a url";

    const targets = collectReadinessLinks(input);
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://portfolio.dev/resume",
          source: "route:resume",
        }),
        expect.objectContaining({
          url: "https://portfolio.dev/projects/signal-desk",
          source: "route:project:signal-desk",
        }),
        expect.objectContaining({
          url: "https://portfolio.dev/blog/validate-citations",
          source: "route:post:validate-citations",
        }),
        expect.objectContaining({
          url: "https://portfolio.dev/knowledge",
          source: "route:knowledge",
        }),
        expect.objectContaining({
          url: "https://portfolio.dev/uploads/portrait.png",
          source: "profile:avatar",
        }),
        expect.objectContaining({
          url: "https://github.com/lin-zhiyuan/signal-desk",
          source: "project:signal-desk:repository",
        }),
      ]),
    );
    expect(targets.filter((target) => target.url.endsWith("/uploads/portrait.png"))).toHaveLength(1);
    expect(targets.some((target) => target.url.startsWith("mailto:"))).toBe(false);
    expect(targets.some((target) => target.url.includes("hidden.portfolio.dev"))).toBe(false);
    expect(targets.some((target) => target.url.endsWith("/lin-zhiyuan/draft"))).toBe(false);
    expect(targets.some((target) => target.url.includes("user:secret@links.portfolio.dev"))).toBe(true);
    expect(targets.some((target) => target.url === "not a url")).toBe(true);
  });

  it("follows RichContent Markdown and HTML modes without guessing", () => {
    expect(
      extractRichContentHrefs(
        '[Markdown](/docs) <a href="https://docs.portfolio.dev/raw">Raw</a> ' +
          'https://plain.portfolio.dev ![Image](https://images.portfolio.dev/shot.png)',
        "markdown",
      ),
    ).toEqual(["/docs", "https://docs.portfolio.dev/raw"]);

    expect(
      extractRichContentHrefs(
        '[Plain text](https://not-clickable.portfolio.dev) ' +
          '<a href="/html-docs">HTML</a><img src="https://images.portfolio.dev/shot.png">',
        "html",
      ),
    ).toEqual(["/html-docs"]);

    expect(extractRichContentHrefs("[Unknown](https://unknown.portfolio.dev)", "rich-text"))
      .toEqual([]);
    expect(extractRichContentHrefs("[Missing](https://missing.portfolio.dev)", undefined))
      .toEqual([]);
  });

  it("collects published body anchors with field sources, relative resolution, and deduplication", () => {
    const input = cleanInput();
    input.projects[0].description = [
      "[Project docs](/guides/project#overview)",
      '<a href="https://shared.portfolio.dev/reference#project">Shared</a>',
      "[Email](mailto:owner@portfolio.dev)",
      "![Screenshot](https://images.portfolio.dev/project.png)",
      "https://plain.portfolio.dev/project",
    ].join("\n\n");
    input.projects[0].descriptionEn = "";
    input.posts[0].contentMarkdown = [
      "[Article docs](guides/article?preview=public#intro)",
      "[Shared again](https://shared.portfolio.dev/reference#article)",
    ].join("\n\n");
    input.posts[0].contentEn = "";

    const targets = collectReadinessLinks(input);

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://portfolio.dev/guides/project",
          source: "project:signal-desk:description",
        }),
        expect.objectContaining({
          url: "https://shared.portfolio.dev/reference",
          source: "project:signal-desk:description",
        }),
        expect.objectContaining({
          url: "https://portfolio.dev/guides/article?preview=public",
          source: "post:validate-citations:contentMarkdown",
        }),
      ]),
    );
    expect(
      targets.filter((target) => target.url === "https://shared.portfolio.dev/reference"),
    ).toHaveLength(1);
    expect(targets.some((target) => target.url.startsWith("mailto:"))).toBe(false);
    expect(targets.some((target) => target.url.includes("images.portfolio.dev"))).toBe(false);
    expect(targets.some((target) => target.url.includes("plain.portfolio.dev"))).toBe(false);
    expect(JSON.stringify(targets)).not.toContain("#overview");
    expect(JSON.stringify(targets)).not.toContain("#intro");
  });

  it("keeps HTML-mode Markdown text and unpublished body links out of the audit", () => {
    const input = cleanInput();
    input.projects[0].contentFormat = "html";
    input.projects[0].description =
      '[Not clickable](https://plain-in-html.portfolio.dev) <a href="/allowed-html">Allowed</a>';
    input.projects[0].descriptionEn = "";
    input.posts[0].contentFormat = "html";
    input.posts[0].contentMarkdown =
      '[Still text](https://post-plain-in-html.portfolio.dev) <a href="/post-html">Post</a>';
    input.posts[0].contentEn = "";
    input.projects.push({
      ...input.projects[0],
      id: "project_archived",
      slug: "archived-project",
      status: "archived",
      description: '<a href="https://archived.portfolio.dev">Archived</a>',
    });
    input.posts.push({
      ...input.posts[0],
      id: "post_draft",
      slug: "draft-post",
      status: "draft",
      contentMarkdown: '<a href="https://draft.portfolio.dev">Draft</a>',
    });

    const targets = collectReadinessLinks(input);

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://portfolio.dev/allowed-html",
          source: "project:signal-desk:description",
        }),
        expect.objectContaining({
          url: "https://portfolio.dev/post-html",
          source: "post:validate-citations:contentMarkdown",
        }),
      ]),
    );
    expect(JSON.stringify(targets)).not.toContain("plain-in-html");
    expect(JSON.stringify(targets)).not.toContain("archived.portfolio.dev");
    expect(JSON.stringify(targets)).not.toContain("draft.portfolio.dev");
  });

  it("turns failed or SSRF-blocked checks into a release blocker and recomputes totals", () => {
    const report = buildReadinessReport(cleanInput());
    const checked = applyLinkChecks(report, [
      {
        url: "https://portfolio.dev/",
        label: "Site",
        source: "deployment:site-url",
        status: "ok",
        httpStatus: 200,
      },
      {
        url: "http://127.0.0.1/internal",
        label: "Unsafe",
        source: "social:unsafe",
        status: "blocked",
        detail: "private address",
      },
    ]);

    expect(checked.items.filter((item) => item.id === "links-audit")).toHaveLength(1);
    expect(checked.items.find((item) => item.id === "links-audit")?.status).toBe("blocker");
    expect(checked.counts.blocker).toBe(1);
    expect(checked.readyToShare).toBe(false);
    expect(checked.linkChecks).toHaveLength(2);
  });

  it("treats skipped malformed public links as blockers instead of optional warnings", () => {
    const report = buildReadinessReport(cleanInput());
    const checked = applyLinkChecks(report, [
      {
        url: "javascript:alert(1)",
        label: "Legacy project link",
        source: "project:legacy:demo",
        status: "skipped",
        detail: "unsupported protocol",
      },
    ]);

    expect(checked.items.find((item) => item.id === "links-audit")?.status).toBe("blocker");
    expect(checked.readyToShare).toBe(false);
  });

  it("keeps the release blocked when the bounded audit cannot cover every target", () => {
    const report = buildReadinessReport(cleanInput());
    const checked = applyLinkChecks(
      report,
      [
        {
          url: "https://portfolio.dev/",
          label: "Site",
          source: "deployment:site-url",
          status: "ok",
          httpStatus: 200,
        },
      ],
      42,
    );

    expect(checked.items.find((item) => item.id === "links-audit")).toMatchObject({
      status: "blocker",
    });
    expect(checked.items.find((item) => item.id === "links-audit")?.detail).toContain(
      "41 个因检查上限未覆盖",
    );
    expect(checked.linkTargetCount).toBe(42);
    expect(checked.readyToShare).toBe(false);
  });
});
