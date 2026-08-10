/** Placeholder demo content — not real personal data. */

export const demoSeed = {
  profile: {
    siteName: "IsMe Demo",
    displayName: "Alex River",
    englishName: "Alex River",
    role: "全栈工程师 · RAG 系统",
    roleEn: "Full-stack Engineer · RAG Systems",
    headline: "做一份面试官能直接追问的个人知识站。",
    headlineEn: "Building personal knowledge sites that interviewers can ask questions to.",
    introduction:
      "这是 IsMe 模板的占位内容。请在后台替换成你自己的资料、项目与知识库，无需改源码。",
    introductionEn:
      "This is placeholder content for the IsMe template. Replace it from the admin panel with your own profile, projects, and knowledge bases — no source code edits required.",
    avatarUrl: "",
    location: "Remote",
    publicEmail: "hello@example.com",
    availability: "开放机会中",
    availabilityEn: "Open to opportunities",
    theme: "terminal",
    defaultLocale: "zh",
  },
  socialLinks: [
    {
      platform: "github",
      label: "GitHub",
      url: "https://github.com/example/isme",
      sortOrder: 0,
      visible: true,
    },
    {
      platform: "email",
      label: "Email",
      url: "mailto:hello@example.com",
      sortOrder: 1,
      visible: true,
    },
  ],
  focusAreas: [
    {
      title: "检索增强生成",
      titleEn: "Retrieval-Augmented Generation",
      description: "面向私有文档集的带引用问答。",
      descriptionEn: "Grounded Q&A over private document collections with citations.",
      tags: ["LangGraph", "Hybrid Retrieval", "Citations"],
      sortOrder: 0,
      visible: true,
    },
    {
      title: "全栈产品工程",
      titleEn: "Full-stack Product Engineering",
      description: "从 schema 到打磨 UI 的 TypeScript 应用，可用 Docker 部署。",
      descriptionEn: "TypeScript apps from schema to polished UI, deployable with Docker.",
      tags: ["Next.js", "SQLite", "Docker"],
      sortOrder: 1,
      visible: true,
    },
  ],
  experiences: [
    {
      type: "work",
      organization: "Northwind Labs",
      organizationEn: "Northwind Labs",
      role: "软件工程实习生",
      roleEn: "Software Engineer Intern",
      startDate: "2024-06",
      endDate: "2024-12",
      description: "交付内部知识工具，并改进检索评测流水线。",
      descriptionEn:
        "Shipped internal knowledge tools and improved retrieval evaluation harnesses.",
      skills: ["TypeScript", "Python", "Eval"],
      sortOrder: 0,
      visible: true,
    },
    {
      type: "education",
      organization: "示例大学",
      organizationEn: "Example University",
      role: "计算机科学学士",
      roleEn: "B.S. Computer Science",
      startDate: "2021-09",
      endDate: "2025-06",
      description: "主修系统、机器学习应用与人机交互。",
      descriptionEn: "Focused on systems, ML applications, and human-computer interaction.",
      skills: ["Algorithms", "ML"],
      sortOrder: 1,
      visible: true,
    },
    {
      type: "competition",
      organization: "全国大学生 AI 挑战赛",
      organizationEn: "National Student AI Challenge",
      role: "队长 · 入围决赛",
      roleEn: "Team Lead · Finalist",
      startDate: "2024-03",
      endDate: "2024-05",
      description: "搭建带引用校验的文档问答原型，进入全国决赛。",
      descriptionEn:
        "Built a document QA prototype with citation checks; placed in the national finals.",
      skills: ["RAG", "Evaluation"],
      sortOrder: 2,
      visible: true,
    },
  ],
  projects: [
    {
      name: "CogDoc",
      nameEn: "CogDoc",
      slug: "cogdoc",
      summary: "本地 RAG 控制台：可校验引用与多智能体编排。",
      summaryEn: "Local RAG console with verified citations and multi-agent orchestration.",
      description:
        `## 问题背景

私有文档问答最难的不是“生成一段像答案的话”，而是让使用者能确认答案来自哪里，并在证据不足时诚实降级。

## 我的实现

- 将检索、回答生成与引用校验拆成独立阶段
- 保存检索证据与 trace，便于复盘错误答案
- 用服务端 API 隔离知识库凭据，不把内部 ID 暴露给浏览器

## 关键取舍

我选择先保证引用可核对，再追求回答流畅度。这样会增加一次校验的延迟，但能避免“有引用格式、没有真实证据”的假确定性。

## 下一步

补齐按问题类型分层的评测集，并把检索失败、引用失败与生成失败分开度量。`,
      descriptionEn:
        `## Context

The hard part of private-document Q&A is not producing plausible prose. It is making every answer verifiable and degrading honestly when evidence is weak.

## Implementation

- Split retrieval, answer generation, and citation validation into explicit stages
- Persist evidence and traces so incorrect answers can be diagnosed
- Keep knowledge-base credentials and internal IDs behind server APIs

## Key trade-off

I prioritized verifiable citations over minimum latency. The extra validation step costs time, but prevents confident-looking answers whose references do not support the claim.

## Next step

Add evaluation sets by question type and measure retrieval, citation, and generation failures separately.`,
      contentFormat: "markdown",
      coverUrl: "",
      repositoryUrl: "https://github.com/example/cogdoc",
      demoUrl: "",
      techStack: ["Python", "LangGraph", "FastAPI", "Rust"],
      role: "RAG 系统设计与实现",
      roleEn: "RAG system design and implementation",
      teamSize: 1,
      duration: "持续迭代",
      durationEn: "Ongoing",
      metrics: [
        {
          label: "可审计回答链路",
          value: "3 个阶段",
          context: "检索、生成与引用校验分别保留证据。",
          labelEn: "Auditable answer path",
          valueEn: "3 stages",
          contextEn: "Retrieval, generation, and citation checks retain separate evidence.",
        },
        {
          label: "浏览器可见的内部知识库 ID",
          value: "0",
          context: "知识库标识和服务凭据只留在服务端。",
          labelEn: "Internal KB IDs exposed to browsers",
          valueEn: "0",
          contextEn: "Knowledge-base identifiers and credentials stay server-side.",
        },
      ],
      decisions: [
        {
          title: "先保证引用可核对，再优化回答延迟",
          tradeoff: "增加一次引用校验会拉长响应时间，但能避免看似有引用、实际证据不支持答案的假确定性。",
          titleEn: "Prioritize verifiable citations over minimum latency",
          tradeoffEn:
            "An additional citation check adds latency, but prevents confident answers whose references do not support the claim.",
        },
        {
          title: "把检索、生成和校验拆成独立阶段",
          tradeoff: "编排复杂度更高，换来的是每一类失败都能单独定位、评测和重试。",
          titleEn: "Separate retrieval, generation, and validation",
          tradeoffEn:
            "The orchestration is more involved, but each failure class can be diagnosed, evaluated, and retried independently.",
        },
      ],
      gallery: [],
      featured: true,
      sortOrder: 0,
      status: "published",
    },
    {
      name: "IsMe",
      nameEn: "IsMe",
      slug: "isme",
      summary: "可复用的个人站模板，支持多知识库对话。",
      summaryEn: "Reusable personal site template with multi-knowledge-base chat.",
      description:
        `## 问题背景

普通作品集只能被浏览，无法承接面试官对项目取舍、职责边界和复盘的追问；同时模板项目很容易把个人资料、密钥与代码绑死。

## 我的实现

- 用 SQLite 与后台管理个人资料、经历、项目和文章
- 用服务端代理连接 CogDoc，访客只接触公开模块 slug
- 提供 Docker、备份恢复、动态 SEO、打印简历和双语内容路径
- 将公开问答限制在站长配置的知识主题，并保留引用与反馈

## 关键取舍

选择单机 SQLite 是为了降低个人部署与备份成本；它适合单站点、小团队维护，但不是横向扩展场景的默认答案。

## 下一步

加入可导出的发布前检查报告，让占位资料、失效链接和未完成案例在分享前被明确阻断。`,
      descriptionEn:
        `## Context

Most portfolios can only be skimmed. They do not carry an interviewer's follow-up questions about trade-offs, ownership, or reflection, and reusable templates often couple personal data and secrets to source code.

## Implementation

- Manage profile, experience, projects, and writing through SQLite and an admin UI
- Proxy CogDoc on the server so visitors only see public module slugs
- Include Docker deployment, backup/restore, runtime SEO, a printable résumé, and bilingual content
- Limit public Q&A to owner-curated topics while retaining citations and feedback

## Key trade-off

SQLite keeps a single-person deployment and backup path simple. It is a deliberate fit for one portfolio instance, not a default for horizontal scaling.

## Next step

Export a launch-readiness report that blocks sharing while placeholder data, broken links, or incomplete case studies remain.`,
      contentFormat: "markdown",
      coverUrl: "",
      repositoryUrl: "https://github.com/example/isme",
      demoUrl: "",
      techStack: ["Next.js", "TypeScript", "Drizzle", "SQLite"],
      role: "独立全栈开发",
      roleEn: "Independent full-stack engineering",
      teamSize: 1,
      duration: "持续迭代",
      durationEn: "Ongoing",
      metrics: [
        {
          label: "发布验证门禁",
          value: "4 类",
          context: "静态检查、单元测试、生产构建与浏览器端到端测试。",
          labelEn: "Release verification gates",
          valueEn: "4 types",
          contextEn: "Static analysis, unit tests, production build, and browser E2E.",
        },
        {
          label: "浏览器可见的服务端密钥",
          value: "0",
          context: "CogDoc 与后台凭据不会进入客户端数据边界。",
          labelEn: "Server secrets exposed to browsers",
          valueEn: "0",
          contextEn: "CogDoc and admin credentials never cross the client boundary.",
        },
        {
          label: "可访问主题",
          value: "5 套",
          context: "每套主题共享对比度、焦点与减弱动画约束。",
          labelEn: "Accessible themes",
          valueEn: "5",
          contextEn: "Every theme shares contrast, focus, and reduced-motion constraints.",
        },
      ],
      decisions: [
        {
          title: "为单人部署选择 SQLite",
          tradeoff: "它让备份、迁移和容器部署保持简单，但明确不把横向扩展当作当前目标。",
          titleEn: "Choose SQLite for a single-owner deployment",
          tradeoffEn:
            "It keeps backups, migrations, and container deployment simple while explicitly giving up horizontal scaling as a current goal.",
        },
        {
          title: "SEO 内容在运行时读取真实数据",
          tradeoff: "牺牲一部分静态缓存收益，避免域名、项目状态和分享卡固化为构建时演示数据。",
          titleEn: "Resolve SEO content from live data at runtime",
          tradeoffEn:
            "This gives up some static caching in exchange for preventing domains, publication state, and share cards from freezing build-time demo data.",
        },
        {
          title: "所有 CogDoc 调用经过服务端代理",
          tradeoff: "站点需要承担超时、限流和降级逻辑，但浏览器永远拿不到 API Key 或内部知识库 ID。",
          titleEn: "Proxy every CogDoc request through the server",
          tradeoffEn:
            "The site must own timeouts, rate limits, and degradation, but browsers never receive API keys or internal knowledge-base IDs.",
        },
      ],
      gallery: [],
      featured: true,
      sortOrder: 1,
      status: "published",
    },
  ],
  posts: [
    {
      title: "个人站为什么需要知识库",
      titleEn: "Why personal sites need a knowledge base",
      slug: "why-personal-knowledge-base",
      excerpt: "把简历首页和可追问的问答接在一起。",
      excerptEn:
        "A short note on pairing a resume homepage with grounded Q&A visitors can actually ask.",
      contentMarkdown: `# 个人站为什么需要知识库

面试官会略读。首页能展示项目，知识库能承接追问：

- 你做了哪些取舍？
- 引用如何保持诚实？
- 下一步会重做什么？

IsMe 把密钥放在 \`.env\`，内容放在 SQLite，再由服务端代理 CogDoc，浏览器永远拿不到 Key。
`,
      contentEn: `# Why personal sites need a knowledge base

Interviewers skim. A homepage can show projects, but a knowledge base lets them ask follow-ups.

IsMe keeps secrets in \`.env\` and content in SQLite, then proxies CogDoc on the server.
`,
      contentFormat: "markdown",
      coverUrl: "",
      category: "Notes",
      tags: ["rag", "portfolio", "cogdoc"],
      status: "published",
      seoTitle: "Why personal sites need a knowledge base",
      seoDescription: "Pair a resume homepage with grounded Q&A visitors can ask.",
    },
    {
      title: "做一个可搬运的个人站",
      titleEn: "Shipping a portable personal site",
      slug: "shipping-portable-personal-site",
      excerpt: "Docker、SQLite 与后台，让下一次 clone 从内容开始。",
      excerptEn:
        "Docker, SQLite, and an admin panel so the next clone starts from content—not a fork fight.",
      contentMarkdown: `# 做一个可搬运的个人站

可复用模板应拆开三件事：

1. **密钥** 在 \`.env\`
2. **内容** 在 SQLite
3. **代码** 可被任何人 clone，而不继承你的履历

这就是 IsMe 的约定。
`,
      contentEn: `# Shipping a portable personal site

Separate secrets, content, and code. After \`db:seed\`, open \`/admin\` and replace the demo voice.
`,
      contentFormat: "markdown",
      coverUrl: "",
      category: "Notes",
      tags: ["portfolio", "docker", "sqlite"],
      status: "published",
      seoTitle: "Shipping a portable personal site",
      seoDescription: "Keep secrets, content, and code on separate rails.",
    },
    {
      title: "Draft note (not public)",
      slug: "draft-hidden-note",
      excerpt: "This draft must never appear on the public blog.",
      contentMarkdown: "# Draft\n\nIf you can read this as a visitor, publishing is broken.\n",
      coverUrl: "",
      category: "Notes",
      tags: ["draft"],
      status: "draft",
      seoTitle: "",
      seoDescription: "",
    },
  ],
  knowledgeBases: [
    {
      name: "关于我",
      nameEn: "About Me",
      slug: "about",
      description: "询问背景、技能与方向。",
      descriptionEn: "Ask about background, skills, and career direction.",
      cogdocKbId: "portfolio-about",
      welcomeMessage: "可以问这份 demo 档案的经历、技能，或 IsMe 怎么工作。",
      welcomeMessageEn:
        "Ask anything about this demo profile — experience, skills, or how IsMe works.",
      suggestedQuestions: [
        "Alex 现在在关注什么？",
        "总结一下竞赛经历。",
        "这个站点用了什么技术栈？",
      ],
      suggestedQuestionsEn: [
        "What is Alex focused on right now?",
        "Summarize the competition experience.",
        "Which tech stack does this site use?",
      ],
      enabled: true,
      sortOrder: 0,
    },
    {
      name: "项目",
      nameEn: "Projects",
      slug: "projects",
      description: "深入项目设计与技术取舍。",
      descriptionEn: "Deep dive into featured projects and technical choices.",
      cogdocKbId: "portfolio-projects",
      welcomeMessage: "可以问项目设计、权衡与实现细节。",
      welcomeMessageEn: "Ask about project design, trade-offs, and implementation details.",
      suggestedQuestions: [
        "CogDoc 解决什么问题？",
        "IsMe 如何保护 CogDoc API Key？",
        "比较 CogDoc 与 IsMe 的职责。",
      ],
      suggestedQuestionsEn: [
        "What problem does CogDoc solve?",
        "How does IsMe keep CogDoc API keys private?",
        "Compare CogDoc and IsMe responsibilities.",
      ],
      enabled: true,
      sortOrder: 1,
    },
  ],
} as const;
