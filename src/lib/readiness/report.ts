import { findPlaceholderMatches } from "./placeholders";
import type {
  ReadinessCategory,
  ReadinessCounts,
  ReadinessInput,
  ReadinessItem,
  ReadinessKnowledgeBase,
  ReadinessLinkCheck,
  ReadinessLinkTarget,
  ReadinessPost,
  ReadinessProfile,
  ReadinessProject,
  ReadinessReport,
  ReadinessStatus,
} from "./types";

const CATEGORY_ORDER: ReadinessCategory[] = [
  "identity",
  "portfolio",
  "experience",
  "content",
  "deployment",
  "knowledge",
  "links",
];

const STATUS_ORDER: Record<ReadinessStatus, number> = {
  blocker: 0,
  warning: 1,
  pass: 2,
};

type ItemOptions = Omit<ReadinessItem, "weight"> & { weight?: number };

function item(options: ItemOptions): ReadinessItem {
  return { ...options, weight: Math.max(0, options.weight ?? 1) };
}

function nonBlank(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function defaultLanguage(input: ReadinessInput): "zh" | "en" {
  return input.profile?.defaultLocale === "en" ? "en" : "zh";
}

function primaryText(language: "zh" | "en", zh: string, en: string): string {
  return language === "en" ? en.trim() || zh : zh;
}

function contentLength(value: string): number {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_#>\[\](){}|~-]/g, " ")
    .replace(/\s+/g, "")
    .trim().length;
}

function safeToken(value: string, fallback: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return token || fallback;
}

function entitySubject(primary: string, secondary: string, fallback: string): string {
  return primary.trim() || secondary.trim() || fallback;
}

function placeholderDetail(values: unknown): string | null {
  const matches = findPlaceholderMatches(values);
  if (matches.length === 0) return null;
  return `命中占位标记：${matches.map((match) => match.label).join("、")}。公开分享前请替换为可核验的真实信息。`;
}

function profileValues(profile: ReadinessProfile, visibleLinks: ReadinessInput["socialLinks"]): unknown {
  return {
    siteName: profile.siteName,
    displayName: profile.displayName,
    englishName: profile.englishName,
    role: profile.role,
    roleEn: profile.roleEn,
    headline: profile.headline,
    headlineEn: profile.headlineEn,
    introduction: profile.introduction,
    introductionEn: profile.introductionEn,
    avatarUrl: profile.avatarUrl,
    location: profile.location,
    publicEmail: profile.publicEmail,
    availability: profile.availability,
    availabilityEn: profile.availabilityEn,
    links: visibleLinks.map((link) => ({ label: link.label, url: link.url })),
  };
}

function projectValues(project: ReadinessProject): unknown {
  return {
    name: project.name,
    nameEn: project.nameEn,
    summary: project.summary,
    summaryEn: project.summaryEn,
    description: project.description,
    descriptionEn: project.descriptionEn,
    coverUrl: project.coverUrl,
    repositoryUrl: project.repositoryUrl,
    demoUrl: project.demoUrl,
    role: project.role,
    roleEn: project.roleEn,
    duration: project.duration,
    durationEn: project.durationEn,
    metrics: project.metrics,
    decisions: project.decisions,
    gallery: project.gallery,
  };
}

function postValues(post: ReadinessPost): unknown {
  return {
    title: post.title,
    titleEn: post.titleEn,
    excerpt: post.excerpt,
    excerptEn: post.excerptEn,
    contentMarkdown: post.contentMarkdown,
    contentEn: post.contentEn,
    coverUrl: post.coverUrl,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
  };
}

function knowledgeValues(kb: ReadinessKnowledgeBase): unknown {
  return {
    name: kb.name,
    nameEn: kb.nameEn,
    description: kb.description,
    descriptionEn: kb.descriptionEn,
    welcomeMessage: kb.welcomeMessage,
    welcomeMessageEn: kb.welcomeMessageEn,
    suggestedQuestions: kb.suggestedQuestions,
    suggestedQuestionsEn: kb.suggestedQuestionsEn,
  };
}

function validContactEmail(value: string): boolean {
  const email = value.trim();
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    findPlaceholderMatches(email).length === 0
  );
}

function validPublicContactLink(value: string): boolean {
  const link = value.trim();
  if (!link || findPlaceholderMatches(link).length > 0) return false;
  if (/^mailto:/i.test(link)) return validContactEmail(link.slice("mailto:".length));
  try {
    const url = new URL(link);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validHttpContentLink(value: string): boolean {
  const link = value.trim();
  if (!link) return false;
  if (link.startsWith("/")) {
    return !link.startsWith("//") && !link.includes("\\") && !link.includes("..");
  }
  try {
    const url = new URL(link);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function siteUrlIssue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "SITE_URL 尚未配置。";
  if (findPlaceholderMatches(value).length > 0) {
    return "SITE_URL 仍指向占位域名、本机或回环地址。";
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "公开站点地址必须使用 HTTPS。";
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.username || url.password) return "SITE_URL 不能包含内嵌用户名或密码。";
    if (url.port) return "SITE_URL 不能包含自定义端口。";
    if (url.search || url.hash) return "SITE_URL 不能包含查询参数或片段。";
    if (url.pathname !== "/") return "SITE_URL 必须指向域名根路径。";
    if (
      !host.includes(".") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
      host.includes(":") ||
      host.endsWith(".local") ||
      host.endsWith(".test") ||
      host.endsWith(".invalid") ||
      host === "example" ||
      host.endsWith(".example") ||
      ["example.com", "example.org", "example.net"].some(
        (reserved) => host === reserved || host.endsWith(`.${reserved}`),
      ) ||
      /^0\.0\.0\.0$/.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
      host === "::1"
    ) {
      return "SITE_URL 不是可公开访问的域名。";
    }
    return null;
  } catch {
    return "SITE_URL 不是有效 URL。";
  }
}

function identityItems(input: ReadinessInput): ReadinessItem[] {
  const { profile } = input;
  const visibleLinks = input.socialLinks.filter((link) => link.visible);
  if (!profile) {
    return [
      item({
        id: "identity-profile",
        category: "identity",
        status: "blocker",
        title: "建立公开身份资料",
        detail: "数据库中没有站点资料，首页和简历页无法形成可信的个人身份。",
        action: { label: "填写资料", href: "/admin/profile" },
        weight: 15,
      }),
    ];
  }

  const items: ReadinessItem[] = [];
  const language = defaultLanguage(input);
  const subject =
    language === "en"
      ? entitySubject(profile.englishName, profile.displayName, profile.siteName)
      : entitySubject(profile.displayName, profile.englishName, profile.siteName);
  items.push(
    item({
      id: "identity-profile",
      category: "identity",
      status: "pass",
      title: "身份资料已建立",
      detail: "已找到可供首页、简历和分享卡使用的站点资料。",
      subject,
      weight: 5,
    }),
  );

  const originality = placeholderDetail(profileValues(profile, visibleLinks));
  items.push(
    item({
      id: "identity-originality",
      category: "identity",
      status: originality ? "blocker" : "pass",
      title: originality ? "替换模板身份与联系方式" : "身份信息未发现模板占位",
      detail: originality ?? "姓名、站点名称、简介与公开联系方式未命中已知占位标记。",
      subject,
      action: originality ? { label: "编辑资料", href: "/admin/profile" } : undefined,
      weight: 12,
    }),
  );

  const requiredIdentity = [
    primaryText(language, profile.displayName, profile.englishName),
    primaryText(language, profile.role, profile.roleEn),
    primaryText(language, profile.headline, profile.headlineEn),
    primaryText(language, profile.introduction, profile.introductionEn),
  ];
  const identityMissing = requiredIdentity.filter((value) => !nonBlank(value)).length;
  const thinNarrative =
    identityMissing === 0 &&
    (contentLength(primaryText(language, profile.headline, profile.headlineEn)) < 10 ||
      contentLength(primaryText(language, profile.introduction, profile.introductionEn)) < 45);
  const narrativeStatus: ReadinessStatus = identityMissing
    ? "blocker"
    : thinNarrative
      ? "warning"
      : "pass";
  items.push(
    item({
      id: "identity-narrative",
      category: "identity",
      status: narrativeStatus,
      title:
        narrativeStatus === "pass"
          ? "个人定位与自我介绍完整"
          : identityMissing
            ? "补齐姓名、角色与自我介绍"
            : "让个人定位更具体",
      detail:
        narrativeStatus === "pass"
          ? "姓名、角色、首页主张和自我介绍均已填写。"
          : identityMissing
            ? `仍有 ${identityMissing} 个核心身份字段为空，面试官无法快速判断你的方向。`
            : "标题或自我介绍偏短，建议补充擅长领域、目标岗位与可追问的技术主张。",
      subject,
      action:
        narrativeStatus === "pass" ? undefined : { label: "完善定位", href: "/admin/profile" },
      weight: 8,
    }),
  );

  const contactReady =
    validContactEmail(profile.publicEmail) ||
    visibleLinks.some((link) => validPublicContactLink(link.url));
  items.push(
    item({
      id: "identity-contact",
      category: "identity",
      status: contactReady ? "pass" : "blocker",
      title: contactReady ? "公开联系路径可用" : "添加真实的公开联系方式",
      detail: contactReady
        ? "至少有一个未命中占位标记的邮箱或公开链接。"
        : "没有真实邮箱或社交链接，面试官无法从站点继续联系你。",
      subject,
      action: contactReady ? undefined : { label: "设置联系方式", href: "/admin/profile" },
      weight: 9,
    }),
  );

  items.push(
    item({
      id: "identity-avatar",
      category: "identity",
      status: nonBlank(profile.avatarUrl) ? "pass" : "warning",
      title: nonBlank(profile.avatarUrl) ? "头像已配置" : "补一张可信的个人头像",
      detail: nonBlank(profile.avatarUrl)
        ? "首页与简历可展示个人头像。"
        : "头像不是上线硬门槛，但能显著降低模板感并帮助面试官建立记忆。",
      subject,
      action: nonBlank(profile.avatarUrl)
        ? undefined
        : { label: "上传头像", href: "/admin/profile" },
      weight: 1,
    }),
  );

  const bilingualComplete = [
    profile.displayName,
    profile.role,
    profile.headline,
    profile.introduction,
    profile.englishName,
    profile.roleEn,
    profile.headlineEn,
    profile.introductionEn,
  ].every(nonBlank);
  items.push(
    item({
      id: "identity-bilingual",
      category: "identity",
      status: bilingualComplete ? "pass" : "warning",
      title: bilingualComplete ? "中英身份资料完整" : "补齐另一语言的身份资料",
      detail: bilingualComplete
        ? "切换语言时不会回退到另一语言文案。"
        : "缺失的翻译会安全回退到主字段，不阻塞上线；若需要双语投递，建议补齐姓名、角色、标题与简介。",
      subject,
      action: bilingualComplete
        ? undefined
        : { label: "补充翻译", href: "/admin/profile" },
      weight: 1,
    }),
  );

  return items;
}

function experienceItems(input: ReadinessInput): ReadinessItem[] {
  const language = defaultLanguage(input);
  const experiences = input.experiences.filter((experience) => experience.visible);
  const focusAreas = input.focusAreas.filter((area) => area.visible);
  const items: ReadinessItem[] = [
    item({
      id: "experience-visible",
      category: "experience",
      status: experiences.length > 0 ? "pass" : "blocker",
      title: experiences.length > 0 ? "履历时间线已建立" : "至少添加一段公开履历",
      detail:
        experiences.length > 0
          ? `当前有 ${experiences.length} 段公开经历。`
          : "简历站缺少工作、教育、竞赛或重要项目经历。",
      action:
        experiences.length > 0
          ? undefined
          : { label: "添加经历", href: "/admin/experiences" },
      weight: 9,
    }),
  ];

  let placeholderCount = 0;
  experiences.forEach((experience, index) => {
    const detail = placeholderDetail({
      organization: experience.organization,
      organizationEn: experience.organizationEn,
      role: experience.role,
      roleEn: experience.roleEn,
      description: experience.description,
      descriptionEn: experience.descriptionEn,
      skills: experience.skills,
    });
    if (!detail) return;
    placeholderCount += 1;
    const subject =
      language === "en"
        ? entitySubject(experience.organizationEn, experience.organization, `经历 ${index + 1}`)
        : entitySubject(experience.organization, experience.organizationEn, `经历 ${index + 1}`);
    items.push(
      item({
        id: `experience-${safeToken(experience.id, String(index + 1))}-originality`,
        category: "experience",
        status: "blocker",
        title: "替换示例履历",
        detail,
        subject,
        action: { label: "编辑经历", href: "/admin/experiences" },
        weight: 6,
      }),
    );
  });

  focusAreas.forEach((area, index) => {
    const detail = placeholderDetail({
      title: area.title,
      titleEn: area.titleEn,
      description: area.description,
      descriptionEn: area.descriptionEn,
      tags: area.tags,
    });
    if (!detail) return;
    placeholderCount += 1;
    const subject =
      language === "en"
        ? entitySubject(area.titleEn, area.title, `方向 ${index + 1}`)
        : entitySubject(area.title, area.titleEn, `方向 ${index + 1}`);
    items.push(
      item({
        id: `focus-${safeToken(area.id, String(index + 1))}-originality`,
        category: "experience",
        status: "blocker",
        title: "替换示例技术方向",
        detail,
        subject,
        action: { label: "编辑方向", href: "/admin/profile" },
        weight: 4,
      }),
    );
  });

  if (placeholderCount === 0 && experiences.length + focusAreas.length > 0) {
    items.push(
      item({
        id: "experience-originality",
        category: "experience",
        status: "pass",
        title: "履历与方向未发现模板占位",
        detail: "所有公开经历和技术方向均未命中已知占位标记。",
        weight: 8,
      }),
    );
  }

  if (experiences.length > 0) {
    const incomplete = experiences.filter(
      (experience) =>
        ![
          primaryText(language, experience.organization, experience.organizationEn),
          primaryText(language, experience.role, experience.roleEn),
          experience.startDate,
          primaryText(language, experience.description, experience.descriptionEn),
        ].every(nonBlank),
    );
    items.push(
      item({
        id: "experience-completeness",
        category: "experience",
        status: incomplete.length === 0 ? "pass" : "blocker",
        title: incomplete.length === 0 ? "公开履历关键信息完整" : "补齐公开履历职责与时间",
        detail:
          incomplete.length === 0
            ? "每段公开经历都有组织、角色、开始时间和职责说明。"
            : `${incomplete.length} 段经历缺少组织、角色、开始时间或职责说明。`,
        action:
          incomplete.length === 0
            ? undefined
            : { label: "完善经历", href: "/admin/experiences" },
        weight: 6,
      }),
    );

    const bilingualIncomplete = experiences.filter((experience) =>
      [
        experience.organization,
        experience.role,
        experience.description,
        experience.organizationEn,
        experience.roleEn,
        experience.descriptionEn,
      ].some((value) => !nonBlank(value)),
    );
    items.push(
      item({
        id: "experience-bilingual",
        category: "experience",
        status: bilingualIncomplete.length === 0 ? "pass" : "warning",
        title:
          bilingualIncomplete.length === 0 ? "中英履历完整" : "补齐履历翻译",
        detail:
          bilingualIncomplete.length === 0
            ? "所有公开经历均有中英组织、角色和职责说明。"
            : `${bilingualIncomplete.length} 段经历缺少某一语言的组织、角色或职责说明；公开页会回退到主字段。`,
        action:
          bilingualIncomplete.length === 0
            ? undefined
            : { label: "补充翻译", href: "/admin/experiences" },
        weight: 1,
      }),
    );
  }

  items.push(
    item({
      id: "experience-focus",
      category: "experience",
      status: focusAreas.length > 0 ? "pass" : "warning",
      title: focusAreas.length > 0 ? "技术方向已公开" : "明确 1–3 个技术方向",
      detail:
        focusAreas.length > 0
          ? `当前展示 ${focusAreas.length} 个技术方向。`
          : "聚焦领域不是上线硬门槛，但能帮助面试官快速建立提问入口。",
      action:
        focusAreas.length > 0 ? undefined : { label: "添加方向", href: "/admin/profile" },
      weight: 2,
    }),
  );

  return items;
}

function projectCaseItems(
  project: ReadinessProject,
  index: number,
  language: "zh" | "en",
): ReadinessItem[] {
  const token = safeToken(project.slug || project.id, String(index + 1));
  const subject =
    language === "en"
      ? entitySubject(project.nameEn, project.name, `项目 ${index + 1}`)
      : entitySubject(project.name, project.nameEn, `项目 ${index + 1}`);
  const action = { label: "编辑项目", href: "/admin/projects" };
  const summaryLength = contentLength(primaryText(language, project.summary, project.summaryEn));
  const descriptionLength = contentLength(
    primaryText(language, project.description, project.descriptionEn),
  );
  const narrativeStatus: ReadinessStatus =
    summaryLength === 0 || descriptionLength === 0
      ? "blocker"
      : summaryLength < 12 || descriptionLength < 100
        ? "warning"
        : "pass";
  const ownershipComplete =
    nonBlank(primaryText(language, project.role, project.roleEn)) &&
    nonBlank(primaryText(language, project.duration, project.durationEn)) &&
    project.teamSize > 0;
  const hasMetrics = project.metrics.some((metric) =>
    nonBlank(primaryText(language, metric.label, metric.labelEn ?? "")) &&
    nonBlank(primaryText(language, metric.value, metric.valueEn ?? "")),
  );
  const hasDecisions = project.decisions.some((decision) =>
    nonBlank(primaryText(language, decision.title, decision.titleEn ?? "")) &&
    nonBlank(primaryText(language, decision.tradeoff, decision.tradeoffEn ?? "")),
  );
  const evidenceStatus: ReadinessStatus =
    hasMetrics && hasDecisions ? "pass" : "blocker";
  const hasMedia = nonBlank(project.coverUrl) || project.gallery.length > 0;
  const suppliedProjectLinks = [project.repositoryUrl, project.demoUrl].filter(nonBlank);
  const hasProjectLink = suppliedProjectLinks.some(validHttpContentLink);
  const hasInvalidProjectLink = suppliedProjectLinks.some((value) => !validHttpContentLink(value));
  const projectLinkStatus: ReadinessStatus = hasInvalidProjectLink
    ? "blocker"
    : hasProjectLink
      ? "pass"
      : "warning";

  return [
    item({
      id: `portfolio-${token}-narrative`,
      category: "portfolio",
      status: narrativeStatus,
      title:
        narrativeStatus === "pass"
          ? "案例叙事可供追问"
          : narrativeStatus === "blocker"
            ? "补齐项目摘要与案例正文"
            : "扩充过短的案例叙事",
      detail:
        narrativeStatus === "pass"
          ? "项目具备摘要和足够完整的背景、实现或复盘正文。"
          : narrativeStatus === "blocker"
            ? "已发布项目不能缺少摘要或案例正文。"
            : "当前文字偏短，建议明确问题背景、你的实现、取舍和复盘。",
      subject,
      action: narrativeStatus === "pass" ? undefined : action,
      weight: 6,
    }),
    item({
      id: `portfolio-${token}-ownership`,
      category: "portfolio",
      status: ownershipComplete ? "pass" : "blocker",
      title: ownershipComplete ? "个人职责边界清楚" : "补齐职责、周期与团队规模",
      detail: ownershipComplete
        ? "案例明确了你的角色、投入周期和团队规模。"
        : "缺少职责、周期或团队规模会让面试官难以区分个人贡献与团队成果。",
      subject,
      action: ownershipComplete ? undefined : action,
      weight: 3,
    }),
    item({
      id: `portfolio-${token}-evidence`,
      category: "portfolio",
      status: evidenceStatus,
      title:
        evidenceStatus === "pass"
          ? "结果与技术取舍均有证据"
          : "至少补一项结果和一条技术取舍",
      detail:
        evidenceStatus === "pass"
          ? `已有 ${project.metrics.length} 项结果与 ${project.decisions.length} 条技术取舍。`
          : !hasMetrics && !hasDecisions
            ? "案例缺少量化或可核验结果，也没有说明关键选择及其代价。"
            : !hasMetrics
              ? "案例已有技术取舍，但仍缺少至少一项可解释口径的结果证据。"
              : "案例已有结果证据，但仍缺少至少一条关键技术选择及其代价。",
      subject,
      action: evidenceStatus === "pass" ? undefined : action,
      weight: 6,
    }),
    item({
      id: `portfolio-${token}-technology`,
      category: "portfolio",
      status: project.techStack.length > 0 ? "pass" : "warning",
      title: project.techStack.length > 0 ? "技术栈已标注" : "补充项目技术栈",
      detail:
        project.techStack.length > 0
          ? `已列出 ${project.techStack.length} 项核心技术。`
          : "技术栈能让面试官快速判断项目与你应聘岗位的关联。",
      subject,
      action: project.techStack.length > 0 ? undefined : action,
      weight: 2,
    }),
    item({
      id: `portfolio-${token}-media`,
      category: "portfolio",
      status: hasMedia ? "pass" : "warning",
      title: hasMedia ? "项目交付物有视觉证据" : "添加项目截图或封面",
      detail: hasMedia
        ? "案例至少包含一张封面或成果画廊图片。"
        : "截图不是硬门槛，但它比纯文字更快证明项目确实被实现和交付。",
      subject,
      action: hasMedia ? undefined : action,
      weight: 2,
    }),
    item({
      id: `portfolio-${token}-link`,
      category: "portfolio",
      status: projectLinkStatus,
      title:
        projectLinkStatus === "pass"
          ? "项目入口已提供"
          : projectLinkStatus === "blocker"
            ? "修复格式错误或含凭据的项目链接"
            : "提供仓库或演示入口",
      detail:
        projectLinkStatus === "pass"
          ? "案例至少提供一个代码仓库或在线演示地址。"
          : projectLinkStatus === "blocker"
            ? "已填写的仓库或演示地址不是安全的 HTTP(S)/站内路径，不能公开分享。"
            : "如果项目允许公开，仓库或演示入口能提高证据可信度。",
      subject,
      action: projectLinkStatus === "pass" ? undefined : action,
      weight: projectLinkStatus === "blocker" ? 4 : 1,
    }),
  ];
}

function portfolioItems(input: ReadinessInput): ReadinessItem[] {
  const language = defaultLanguage(input);
  const projects = input.projects.filter((project) => project.status === "published");
  const items: ReadinessItem[] = [
    item({
      id: "portfolio-published",
      category: "portfolio",
      status: projects.length > 0 ? "pass" : "blocker",
      title: projects.length > 0 ? "项目案例已发布" : "至少发布一个项目案例",
      detail:
        projects.length > 0
          ? `当前有 ${projects.length} 个公开项目案例。`
          : "作品集没有公开案例，无法证明你的技术判断和交付能力。",
      action:
        projects.length > 0
          ? undefined
          : { label: "发布项目", href: "/admin/projects" },
      weight: 12,
    }),
  ];

  if (projects.length === 0) return items;

  items.push(
    item({
      id: "portfolio-featured",
      category: "portfolio",
      status: projects.some((project) => project.featured) ? "pass" : "warning",
      title: projects.some((project) => project.featured) ? "首页已有精选案例" : "选择一个首页精选案例",
      detail: projects.some((project) => project.featured)
        ? "至少一个案例会在首页形成明确的作品入口。"
        : "项目已经公开，但首页没有精选案例，面试官可能无法第一眼看到它。",
      action: projects.some((project) => project.featured)
        ? undefined
        : { label: "设置精选", href: "/admin/projects" },
      weight: 3,
    }),
  );

  let placeholderCount = 0;
  projects.forEach((project, index) => {
    const detail = placeholderDetail(projectValues(project));
    if (!detail) return;
    placeholderCount += 1;
    const subject =
      language === "en"
        ? entitySubject(project.nameEn, project.name, `项目 ${index + 1}`)
        : entitySubject(project.name, project.nameEn, `项目 ${index + 1}`);
    items.push(
      item({
        id: `portfolio-${safeToken(project.slug || project.id, String(index + 1))}-originality`,
        category: "portfolio",
        status: "blocker",
        title: "替换项目中的模板数据",
        detail,
        subject,
        action: { label: "编辑项目", href: "/admin/projects" },
        weight: 7,
      }),
    );
  });
  if (placeholderCount === 0) {
    items.push(
      item({
        id: "portfolio-originality",
        category: "portfolio",
        status: "pass",
        title: "公开项目未发现模板占位",
        detail: "项目正文、证据和外部地址均未命中已知占位标记。",
        weight: 10,
      }),
    );
  }

  projects.forEach((project, index) =>
    items.push(...projectCaseItems(project, index, language)),
  );

  const bilingual = projects.every((project) => {
    const core = [
      project.name,
      project.summary,
      project.description,
      project.role,
      project.duration,
      project.nameEn,
      project.summaryEn,
      project.descriptionEn,
      project.roleEn,
      project.durationEn,
    ];
    const metrics = project.metrics.every((metric) =>
      [metric.label, metric.value, metric.labelEn, metric.valueEn].every(nonBlank),
    );
    const decisions = project.decisions.every((decision) =>
      [decision.title, decision.tradeoff, decision.titleEn, decision.tradeoffEn].every(nonBlank),
    );
    return core.every(nonBlank) && metrics && decisions;
  });
  items.push(
    item({
      id: "portfolio-bilingual",
      category: "portfolio",
      status: bilingual ? "pass" : "warning",
      title: bilingual ? "公开案例的中英版本完整" : "补齐案例翻译",
      detail: bilingual
        ? "项目切换语言时不会回退核心叙事与证据。"
        : "缺失翻译会安全回退到主字段，不阻塞上线；若需要双语投递，建议补齐摘要、正文、职责、结果与取舍。",
      action: bilingual
        ? undefined
        : { label: "补充翻译", href: "/admin/projects" },
      weight: 1,
    }),
  );

  return items;
}

function contentItems(input: ReadinessInput): ReadinessItem[] {
  const language = defaultLanguage(input);
  const posts = input.posts.filter((post) => post.status === "published");
  const items: ReadinessItem[] = [
    item({
      id: "content-published",
      category: "content",
      status: posts.length > 0 ? "pass" : "warning",
      title: posts.length > 0 ? "已有公开技术内容" : "发布一篇技术复盘",
      detail:
        posts.length > 0
          ? `当前有 ${posts.length} 篇公开文章。`
          : "文章不是上线硬门槛，但高质量复盘能展示持续思考，而不只是列举技术栈。",
      action: posts.length > 0 ? undefined : { label: "撰写文章", href: "/admin/posts" },
      weight: 2,
    }),
  ];

  let placeholderCount = 0;
  posts.forEach((post, index) => {
    const detail = placeholderDetail(postValues(post));
    if (!detail) return;
    placeholderCount += 1;
    const subject =
      language === "en"
        ? entitySubject(post.titleEn, post.title, `文章 ${index + 1}`)
        : entitySubject(post.title, post.titleEn, `文章 ${index + 1}`);
    items.push(
      item({
        id: `content-${safeToken(post.slug || post.id, String(index + 1))}-originality`,
        category: "content",
        status: "blocker",
        title: "替换文章中的模板内容",
        detail,
        subject,
        action: { label: "编辑文章", href: "/admin/posts" },
        weight: 4,
      }),
    );
  });
  if (posts.length > 0 && placeholderCount === 0) {
    items.push(
      item({
        id: "content-originality",
        category: "content",
        status: "pass",
        title: "公开文章未发现模板占位",
        detail: "文章标题、摘要、正文和 SEO 文案均未命中已知占位标记。",
        weight: 3,
      }),
    );
  }

  if (posts.length > 0) {
    const incompleteContent = posts.filter(
      (post) =>
        ![
          primaryText(language, post.title, post.titleEn),
          primaryText(language, post.excerpt, post.excerptEn),
          primaryText(language, post.contentMarkdown, post.contentEn),
        ].every(nonBlank),
    );
    items.push(
      item({
        id: "content-completeness",
        category: "content",
        status: incompleteContent.length === 0 ? "pass" : "blocker",
        title:
          incompleteContent.length === 0 ? "公开文章正文完整" : "补齐已发布文章的摘要与正文",
        detail:
          incompleteContent.length === 0
            ? "所有公开文章均有可展示的标题、摘要和正文。"
            : `${incompleteContent.length} 篇已发布文章缺少标题、摘要或正文，公开页面不应保持空壳。`,
        action:
          incompleteContent.length === 0
            ? undefined
            : { label: "完善文章", href: "/admin/posts" },
        weight: 4,
      }),
    );

    const incompleteSeo = posts.filter(
      (post) => ![post.seoTitle, post.seoDescription].every(nonBlank),
    );
    items.push(
      item({
        id: "content-seo",
        category: "content",
        status: incompleteSeo.length === 0 ? "pass" : "warning",
        title: incompleteSeo.length === 0 ? "文章 SEO 文案完整" : "补齐文章 SEO 文案",
        detail:
          incompleteSeo.length === 0
            ? "所有公开文章均有独立 SEO 标题和描述。"
            : `${incompleteSeo.length} 篇文章缺少独立 SEO 标题或描述；页面仍可访问，但搜索分享效果会下降。`,
        action:
          incompleteSeo.length === 0
            ? undefined
            : { label: "完善 SEO", href: "/admin/posts" },
        weight: 1,
      }),
    );

    const bilingualIncomplete = posts.filter((post) =>
      [
        post.title,
        post.excerpt,
        post.contentMarkdown,
        post.titleEn,
        post.excerptEn,
        post.contentEn,
      ].some((value) => !nonBlank(value)),
    );
    items.push(
      item({
        id: "content-bilingual",
        category: "content",
        status: bilingualIncomplete.length === 0 ? "pass" : "warning",
        title:
          bilingualIncomplete.length === 0 ? "中英文章内容完整" : "补齐文章翻译",
        detail:
          bilingualIncomplete.length === 0
            ? "所有公开文章均有中英标题、摘要和正文。"
            : `${bilingualIncomplete.length} 篇公开文章缺少某一语言的标题、摘要或正文；公开页会回退到主字段。`,
        action:
          bilingualIncomplete.length === 0
            ? undefined
            : { label: "补充翻译", href: "/admin/posts" },
        weight: 1,
      }),
    );
  }

  return items;
}

function deploymentItems(input: ReadinessInput): ReadinessItem[] {
  const urlIssue = siteUrlIssue(input.env.siteUrl);
  const credentialIssues = [
    !input.env.adminEnvironmentReady && "ADMIN_PASSWORD 环境回退值",
    !input.env.adminCredentialReady &&
      (input.env.adminCredentialSource === "database"
        ? "当前数据库后台密码（请重新设置）"
        : "当前后台密码（ADMIN_PASSWORD）"),
    !input.env.sessionSecretReady && "SESSION_SECRET",
  ].filter(Boolean) as string[];

  return [
    item({
      id: "deployment-site-url",
      category: "deployment",
      status: urlIssue ? "blocker" : "pass",
      title: urlIssue ? "配置公网 HTTPS 地址" : "公开站点地址可用于分享",
      detail: urlIssue ?? "SITE_URL 使用非占位的 HTTPS 公网域名。",
      action: urlIssue ? { label: "查看部署配置", href: "/admin/security" } : undefined,
      weight: 12,
    }),
    item({
      id: "deployment-credentials",
      category: "deployment",
      status: credentialIssues.length > 0 ? "blocker" : "pass",
      title: credentialIssues.length > 0 ? "更换上线凭据" : "生效凭据符合当前强度策略",
      detail:
        credentialIssues.length > 0
          ? `以下凭据缺失、过弱、仍为示例值或来自旧策略：${credentialIssues.join("、")}。报告不会读取或返回其具体内容。`
          : `环境回退密码、当前${input.env.adminCredentialSource === "database" ? "数据库" : "环境"}后台密码与会话密钥均符合当前策略。`,
      action:
        credentialIssues.length > 0
          ? { label: "查看安全设置", href: "/admin/security" }
          : undefined,
      weight: 12,
    }),
    item({
      id: "deployment-storage",
      category: "deployment",
      status: input.env.storageMode === "s3" ? "pass" : "warning",
      title: input.env.storageMode === "s3" ? "媒体使用对象存储" : "确认本地上传目录已持久化",
      detail:
        input.env.storageMode === "s3"
          ? "媒体上传使用已配置的 S3 兼容存储。"
          : "本地媒体模式可以上线，但容器部署必须持久化 /app/public/uploads 并纳入备份。",
      action:
        input.env.storageMode === "s3"
          ? undefined
          : { label: "检查媒体", href: "/admin/media" },
      weight: 1,
    }),
    item({
      id: "deployment-runtime",
      category: "deployment",
      status: input.env.nodeEnv === "production" ? "pass" : "blocker",
      title:
        input.env.nodeEnv === "production" ? "正在生产运行模式验收" : "最终用生产构建再验收一次",
      detail:
        input.env.nodeEnv === "production"
          ? "NODE_ENV 为 production。"
          : "当前报告来自非生产模式，不能证明生产构建、Cookie 与运行时配置可用；请在真实部署上复查。",
      weight: 2,
    }),
  ];
}

function knowledgeItems(input: ReadinessInput): ReadinessItem[] {
  const language = defaultLanguage(input);
  const knowledgeBases = input.knowledgeBases.filter((kb) => kb.enabled);
  const items: ReadinessItem[] = [
    item({
      id: "knowledge-modules",
      category: "knowledge",
      status: knowledgeBases.length > 0 ? "pass" : "warning",
      title: knowledgeBases.length > 0 ? "知识问答模块已启用" : "知识问答当前未启用",
      detail:
        knowledgeBases.length > 0
          ? `当前有 ${knowledgeBases.length} 个公开知识模块。`
          : "知识问答是增强功能；若不打算展示，可保持关闭，不影响普通作品集上线。",
      action:
        knowledgeBases.length > 0
          ? undefined
          : { label: "配置知识库", href: "/admin/knowledge-bases" },
      weight: 2,
    }),
  ];

  if (knowledgeBases.length === 0) return items;

  let placeholderCount = 0;
  knowledgeBases.forEach((kb, index) => {
    const detail = placeholderDetail(knowledgeValues(kb));
    if (!detail) return;
    placeholderCount += 1;
    const subject =
      language === "en"
        ? entitySubject(kb.nameEn, kb.name, `知识库 ${index + 1}`)
        : entitySubject(kb.name, kb.nameEn, `知识库 ${index + 1}`);
    items.push(
      item({
        id: `knowledge-${safeToken(kb.slug || kb.id, String(index + 1))}-originality`,
        category: "knowledge",
        status: "blocker",
        title: "替换知识库中的 demo 文案",
        detail,
        subject,
        action: { label: "编辑知识库", href: "/admin/knowledge-bases" },
        weight: 6,
      }),
    );
  });
  if (placeholderCount === 0) {
    items.push(
      item({
        id: "knowledge-originality",
        category: "knowledge",
        status: "pass",
        title: "知识问答文案未发现模板占位",
        detail: "所有公开知识模块均未命中已知占位标记。",
        weight: 7,
      }),
    );
  }

  const incomplete = knowledgeBases.filter(
    (kb) => {
      const questions =
        language === "en" && kb.suggestedQuestionsEn.length > 0
          ? kb.suggestedQuestionsEn
          : kb.suggestedQuestions;
      return (
        ![
          primaryText(language, kb.name, kb.nameEn),
          primaryText(language, kb.description, kb.descriptionEn),
          kb.cogdocKbId,
          primaryText(language, kb.welcomeMessage, kb.welcomeMessageEn),
        ].every(nonBlank) || !questions.some(nonBlank)
      );
    },
  );
  items.push(
    item({
      id: "knowledge-completeness",
      category: "knowledge",
      status: incomplete.length === 0 ? "pass" : "blocker",
      title: incomplete.length === 0 ? "知识模块入口完整" : "补齐知识库 ID 与引导问题",
      detail:
        incomplete.length === 0
          ? "每个公开模块都有名称、说明、服务端知识库 ID、欢迎语和建议问题。"
          : `${incomplete.length} 个启用模块缺少说明、CogDoc 知识库 ID、欢迎语或建议问题。`,
      action:
        incomplete.length === 0
          ? undefined
          : { label: "完善知识库", href: "/admin/knowledge-bases" },
      weight: 7,
    }),
  );

  const bilingualIncomplete = knowledgeBases.filter(
    (kb) =>
      ![
        kb.name,
        kb.description,
        kb.welcomeMessage,
        kb.nameEn,
        kb.descriptionEn,
        kb.welcomeMessageEn,
      ].every(nonBlank) ||
      !kb.suggestedQuestions.some(nonBlank) ||
      !kb.suggestedQuestionsEn.some(nonBlank),
  );
  items.push(
    item({
      id: "knowledge-bilingual",
      category: "knowledge",
      status: bilingualIncomplete.length === 0 ? "pass" : "warning",
      title:
        bilingualIncomplete.length === 0
          ? "中英知识问答入口完整"
          : "补齐知识问答翻译",
      detail:
        bilingualIncomplete.length === 0
          ? "所有启用模块均有中英名称、说明、欢迎语和建议问题。"
          : `${bilingualIncomplete.length} 个模块缺少某一语言的入口文案；公开页会回退到主字段。`,
      action:
        bilingualIncomplete.length === 0
          ? undefined
          : { label: "补充翻译", href: "/admin/knowledge-bases" },
      weight: 1,
    }),
  );

  const providerIssues = [
    !input.env.cogdocApiUrlConfigured && "COGDOC_API_URL",
    !input.env.cogdocApiKeyConfigured && "COGDOC_API_KEY",
  ].filter(Boolean) as string[];
  items.push(
    item({
      id: "knowledge-provider",
      category: "knowledge",
      status: providerIssues.length === 0 ? "warning" : "blocker",
      title:
        providerIssues.length === 0
          ? "验证 CogDoc 服务健康状态"
          : "连接真实 CogDoc 服务",
      detail:
        providerIssues.length === 0
          ? "服务地址与访问密钥已配置，但仅在主动发布检查中完成真实健康探测后才会放行。"
          : `启用公开知识模块时，${providerIssues.join("、")} 不能缺失；否则访客只能收到 demo 回答。`,
      action:
        providerIssues.length === 0
          ? undefined
          : { label: "查看知识库配置", href: "/admin/knowledge-bases" },
      weight: 8,
    }),
  );

  return items;
}

export type ReadinessKnowledgeHealth = {
  ok: boolean;
  status?: number;
  missingCount?: number;
  emptyCount?: number;
  unverifiedCount?: number;
};

function providerIsVerified(items: ReadinessItem[]): boolean {
  const provider = items.find((current) => current.id === "knowledge-provider");
  return !provider || provider.status === "pass";
}

/** Apply a trusted server-side health result without exposing internal service details. */
export function applyKnowledgeHealth(
  report: ReadinessReport,
  health: ReadinessKnowledgeHealth,
): ReadinessReport {
  const provider = report.items.find((current) => current.id === "knowledge-provider");
  if (!provider || provider.status === "blocker") return report;

  const providerItem = item({
    id: "knowledge-provider",
    category: "knowledge",
    status: health.ok ? "pass" : "blocker",
    title: health.ok ? "CogDoc 服务健康检查通过" : "CogDoc 服务当前不可用",
    detail: health.ok
      ? "服务健康，并且每个启用知识库都存在且含有文档或已批准知识。"
      : (health.missingCount ?? 0) + (health.emptyCount ?? 0) + (health.unverifiedCount ?? 0) > 0
        ? `知识库验证未通过：${health.missingCount ?? 0} 个不存在、${health.emptyCount ?? 0} 个没有可检索内容、${health.unverifiedCount ?? 0} 个未能完成验证。`
        : health.status
          ? `受保护的服务端健康探测返回 HTTP ${health.status}，修复后请重新检查。`
          : "受保护的服务端健康探测失败；报告未暴露内部地址或错误详情。",
    action: health.ok
      ? undefined
      : { label: "检查知识库服务", href: "/admin/knowledge-bases" },
    weight: 8,
  });
  const items = sortItems([
    ...report.items.filter((current) => current.id !== "knowledge-provider"),
    providerItem,
  ]);
  const counts = readinessCounts(items);
  const linksPassed = items.find((current) => current.id === "links-audit")?.status === "pass";
  return {
    ...report,
    score: calculateReadinessScore(items),
    readyToShare: counts.blocker === 0 && linksPassed,
    counts,
    items,
  };
}

function linksPendingItem(input: ReadinessInput): ReadinessItem {
  const targetCount = collectReadinessLinks(input).length;
  return item({
    id: "links-audit",
    category: "links",
    status: "warning",
    title: "运行一次受保护的链接检查",
    detail:
      targetCount > 0
        ? `已收集 ${targetCount} 个公开 HTTP(S) 地址；上线前请主动检查可达性。`
        : "当前没有可供自动检查的公开 HTTP(S) 地址。",
    weight: 1,
  });
}

export function readinessCounts(items: ReadinessItem[]): ReadinessCounts {
  return items.reduce<ReadinessCounts>(
    (counts, current) => {
      counts[current.status] += 1;
      return counts;
    },
    { pass: 0, warning: 0, blocker: 0 },
  );
}

export function calculateReadinessScore(items: ReadinessItem[]): number {
  const totalWeight = items.reduce((sum, current) => sum + current.weight, 0);
  if (totalWeight === 0) return 0;
  const earned = items.reduce((sum, current) => {
    if (current.status === "pass") return sum + current.weight;
    if (current.status === "warning") return sum + current.weight * 0.5;
    return sum;
  }, 0);
  return Math.round((earned / totalWeight) * 100);
}

function sortItems(items: ReadinessItem[]): ReadinessItem[] {
  return items
    .map((current, index) => ({ current, index }))
    .sort((a, b) => {
      const category =
        CATEGORY_ORDER.indexOf(a.current.category) - CATEGORY_ORDER.indexOf(b.current.category);
      if (category !== 0) return category;
      const status = STATUS_ORDER[a.current.status] - STATUS_ORDER[b.current.status];
      return status || a.index - b.index;
    })
    .map(({ current }) => current);
}

export function buildReadinessReport(
  input: ReadinessInput,
  now: Date | string = new Date(),
): ReadinessReport {
  const generatedAt = typeof now === "string" ? new Date(now).toISOString() : now.toISOString();
  const items = sortItems([
    ...identityItems(input),
    ...portfolioItems(input),
    ...experienceItems(input),
    ...contentItems(input),
    ...deploymentItems(input),
    ...knowledgeItems(input),
    linksPendingItem(input),
  ]);
  const counts = readinessCounts(items);
  return {
    generatedAt,
    score: calculateReadinessScore(items),
    // A local-only report cannot claim the public links are ready. The client
    // enters a separate VERIFY LINKS state until applyLinkChecks clears it.
    readyToShare: false,
    counts,
    items,
  };
}

export function applyLinkChecks(
  report: ReadinessReport,
  linkChecks: ReadinessLinkCheck[],
  totalTargetCount = linkChecks.length,
): ReadinessReport {
  const normalizedTargetCount = Math.max(linkChecks.length, Math.floor(totalTargetCount));
  const unchecked = normalizedTargetCount - linkChecks.length;
  const failed = linkChecks.filter((check) => check.status === "failed").length;
  const blocked = linkChecks.filter((check) => check.status === "blocked").length;
  const skipped = linkChecks.filter((check) => check.status === "skipped").length;
  const ok = linkChecks.filter((check) => check.status === "ok").length;
  const status: ReadinessStatus =
    failed + blocked + skipped + unchecked > 0
      ? "blocker"
      : linkChecks.length === 0
        ? "warning"
        : "pass";
  const detail =
    normalizedTargetCount === 0
      ? "没有找到可检查的公开 HTTP(S) 地址。"
      : `共发现 ${normalizedTargetCount} 个地址，已检查 ${linkChecks.length} 个：${ok} 个可达、${failed} 个失败、${blocked} 个因安全策略阻止、${skipped} 个跳过、${unchecked} 个因检查上限未覆盖。`;
  const auditItem = item({
    id: "links-audit",
    category: "links",
    status,
    title:
      status === "pass"
        ? "公开链接均可达"
        : status === "blocker"
          ? "修复失效或不安全的公开链接"
          : "链接检查未覆盖全部地址",
    detail,
    weight: status === "blocker" ? 8 : 2,
  });
  const items = sortItems([
    ...report.items.filter((current) => current.id !== "links-audit"),
    auditItem,
  ]);
  const counts = readinessCounts(items);
  return {
    ...report,
    score: calculateReadinessScore(items),
    readyToShare:
      counts.blocker === 0 && status === "pass" && providerIsVerified(items),
    counts,
    items,
    linkChecks: [...linkChecks],
    linkTargetCount: normalizedTargetCount,
  };
}

export function collectReadinessLinks(input: ReadinessInput): ReadinessLinkTarget[] {
  const targets: ReadinessLinkTarget[] = [];
  const seen = new Set<string>();
  let baseUrl: URL | null = null;
  try {
    const parsed = new URL(input.env.siteUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") baseUrl = parsed;
  } catch {
    baseUrl = null;
  }

  const add = (raw: string, label: string, source: string) => {
    const value = raw.trim();
    if (!value) return;
    if (/^mailto:/i.test(value) && validContactEmail(value.slice("mailto:".length))) return;
    let normalized = value;
    try {
      const url = value.startsWith("/") && baseUrl ? new URL(value, baseUrl) : new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") normalized = url.toString();
    } catch {
      // Preserve malformed legacy values so the safe network layer can return
      // an explicit blocked/skipped result instead of silently missing them.
    }
    if (seen.has(normalized)) return;
    seen.add(normalized);
    targets.push({ url: normalized, label, source });
  };

  add(input.env.siteUrl, "站点公开地址", "deployment:site-url");
  if (baseUrl) {
    add("/resume", "公开简历", "route:resume");
    add("/projects", "项目列表", "route:projects");
    add("/contact", "联系页面", "route:contact");
    input.projects
      .filter((project) => project.status === "published" && nonBlank(project.slug))
      .forEach((project) =>
        add(
          `/projects/${encodeURIComponent(project.slug)}`,
          `${project.name} 案例页`,
          `route:project:${project.slug}`,
        ),
      );
    if (input.posts.some((post) => post.status === "published")) {
      add("/blog", "文章列表", "route:blog");
      input.posts
        .filter((post) => post.status === "published" && nonBlank(post.slug))
        .forEach((post) =>
          add(
            `/blog/${encodeURIComponent(post.slug)}`,
            `${post.title} 文章页`,
            `route:post:${post.slug}`,
          ),
        );
    }
    if (input.knowledgeBases.some((knowledgeBase) => knowledgeBase.enabled)) {
      add("/knowledge", "知识问答页面", "route:knowledge");
    }
  }
  if (input.profile) add(input.profile.avatarUrl, "个人头像", "profile:avatar");
  input.socialLinks
    .filter((link) => link.visible)
    .forEach((link) => add(link.url, link.label || link.platform, `social:${link.id}`));
  input.projects
    .filter((project) => project.status === "published")
    .forEach((project) => {
      add(project.coverUrl, `${project.name} 封面`, `project:${project.slug}:cover`);
      add(project.repositoryUrl, `${project.name} 仓库`, `project:${project.slug}:repository`);
      add(project.demoUrl, `${project.name} 演示`, `project:${project.slug}:demo`);
      project.gallery.forEach((gallery, index) =>
        add(gallery.src, `${project.name} 图片 ${index + 1}`, `project:${project.slug}:gallery`),
      );
    });
  input.posts
    .filter((post) => post.status === "published")
    .forEach((post) => add(post.coverUrl, `${post.title} 封面`, `post:${post.slug}:cover`));

  return targets;
}
