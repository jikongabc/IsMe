import "server-only";

import { createHash } from "node:crypto";
import { buildReadinessReport } from "@/lib/readiness/report";
import type {
  ReadinessInput,
  ReadinessKnowledgeBase,
  ReadinessProfile,
} from "@/lib/readiness/types";
import {
  collectPortfolioPackMediaReferences,
  isPortfolioPackSectionEmptyOrDemoOnly,
  normalizePortfolioPackPublications,
  parsePortfolioPack,
} from ".";
import type {
  PortfolioPackChange,
  PortfolioPackIssue,
  PortfolioPackPlanInput,
  PortfolioPackPreviewPlan,
  PortfolioPackReadinessSummary,
  PortfolioPackSection,
  PortfolioPackSectionPlan,
  PortfolioPackSections,
  PortfolioPackV1,
} from "./types";
import { PORTFOLIO_PACK_SECTIONS, PORTFOLIO_PACK_VERSION } from "./types";

const MAX_CHANGES_PER_SECTION = 60;

const PROFILE_FIELDS = [
  "siteName",
  "displayName",
  "englishName",
  "role",
  "roleEn",
  "headline",
  "headlineEn",
  "introduction",
  "introductionEn",
  "avatarUrl",
  "location",
  "publicEmail",
  "availability",
  "availabilityEn",
] as const;

const APPEARANCE_FIELDS = [
  "theme",
  "defaultLocale",
  "enabledThemes",
  "accent",
  "accent2",
] as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function displayValue(value: unknown): string {
  const raw = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 87)}…` : compact;
}

function cloneSections(sections: PortfolioPackSections): PortfolioPackSections {
  return structuredClone(sections);
}

export function mergePortfolioPackSelection(
  currentInput: PortfolioPackV1,
  incomingInput: PortfolioPackV1,
  selection: readonly PortfolioPackSection[],
  publicationTimestamp?: string,
): ReturnType<typeof normalizePortfolioPackPublications> {
  const current = parsePortfolioPack(currentInput);
  const incoming = parsePortfolioPack(incomingInput);
  const selected = new Set(selection);
  const sections = cloneSections(current.sections);
  for (const section of PORTFOLIO_PACK_SECTIONS) {
    if (selected.has(section)) {
      (sections as Record<PortfolioPackSection, unknown>)[section] = structuredClone(
        incoming.sections[section],
      );
    }
  }

  const normalized = normalizePortfolioPackPublications(
    parsePortfolioPack({ ...current, sections }),
    publicationTimestamp,
  );

  // Publication normalization inspects the complete projected site so it uses
  // the effective locale, but an unselected section must remain byte-for-byte
  // outside the mutation boundary.
  for (const section of PORTFOLIO_PACK_SECTIONS) {
    if (!selected.has(section)) {
      (normalized.pack.sections as Record<PortfolioPackSection, unknown>)[section] =
        structuredClone(current.sections[section]);
    }
  }
  normalized.adjustments = normalized.adjustments.filter((adjustment) =>
    selected.has(adjustment.section),
  );
  return normalized;
}

function fingerprintPayload(
  current: PortfolioPackV1,
  projected: PortfolioPackV1,
  selection: readonly PortfolioPackSection[],
  interlockSalt = "",
) {
  return {
    version: PORTFOLIO_PACK_VERSION,
    interlockSalt,
    selection: PORTFOLIO_PACK_SECTIONS.filter((section) => selection.includes(section)),
    current: Object.fromEntries(
      PORTFOLIO_PACK_SECTIONS.filter((section) => selection.includes(section)).map(
        (section) => [section, current.sections[section]],
      ),
    ),
    projected: Object.fromEntries(
      PORTFOLIO_PACK_SECTIONS.filter((section) => selection.includes(section)).map(
        (section) => [section, projected.sections[section]],
      ),
    ),
  };
}

export function createPortfolioPackFingerprint(
  current: PortfolioPackV1,
  projected: PortfolioPackV1,
  selection: readonly PortfolioPackSection[],
  interlockSalt = "",
): string {
  return createHash("sha256")
    .update(canonical(fingerprintPayload(current, projected, selection, interlockSalt)))
    .digest("hex");
}

function singletonPlan(
  section: "profile" | "appearance",
  current: PortfolioPackV1,
  incoming: PortfolioPackV1,
  fields: readonly string[],
  selected: boolean,
  recommended: boolean,
): PortfolioPackSectionPlan {
  const before = current.sections[section] as unknown as Record<string, unknown>;
  const after = incoming.sections[section] as unknown as Record<string, unknown>;
  const changedFields = fields.filter((field) => canonical(before[field]) !== canonical(after[field]));
  const changes: PortfolioPackChange[] = changedFields.length === 0
    ? []
    : [{
        action: "replace",
        key: section,
        label: section === "profile" ? "公开身份资料" : "公开外观配置",
        fields: changedFields,
        from: changedFields.length === 1 ? displayValue(before[changedFields[0]!]) : undefined,
        to: changedFields.length === 1 ? displayValue(after[changedFields[0]!]) : undefined,
      }];
  return {
    section,
    current: 1,
    incoming: 1,
    added: 0,
    replaced: changes.length,
    removed: 0,
    changes,
    changesTruncated: false,
    selected,
    recommended,
  };
}

type CollectionSection = Exclude<PortfolioPackSection, "profile" | "appearance">;

function baseCollectionKey(section: CollectionSection, item: Record<string, unknown>): string {
  if (section === "projects" || section === "posts" || section === "knowledgeBases") {
    return String(item.slug ?? "untitled");
  }
  if (section === "socialLinks") {
    return `${String(item.platform ?? "link").toLowerCase()}|${String(item.label ?? "")}`;
  }
  if (section === "focusAreas") {
    return `${String(item.title ?? "")}|${String(item.titleEn ?? "")}`;
  }
  return [item.type, item.organization, item.role, item.startDate]
    .map((value) => String(value ?? ""))
    .join("|");
}

function collectionLabel(section: CollectionSection, item: Record<string, unknown>): string {
  if (section === "projects") return String(item.name || item.nameEn || item.slug || "未命名项目");
  if (section === "posts") return String(item.title || item.titleEn || item.slug || "未命名文章");
  if (section === "knowledgeBases") return String(item.name || item.nameEn || item.slug || "未命名知识库");
  if (section === "socialLinks") return String(item.label || item.platform || "未命名链接");
  if (section === "focusAreas") return String(item.title || item.titleEn || "未命名方向");
  return String(item.organization || item.organizationEn || item.role || "未命名经历");
}

function keyedCollection(section: CollectionSection, values: unknown[]) {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const item = value as Record<string, unknown>;
    const base = baseCollectionKey(section, item);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return {
      key: occurrence === 0 ? base : `${base}#${occurrence + 1}`,
      label: collectionLabel(section, item),
      value,
    };
  });
}

function collectionPlan(
  section: CollectionSection,
  current: PortfolioPackV1,
  incoming: PortfolioPackV1,
  selected: boolean,
  recommended: boolean,
): PortfolioPackSectionPlan {
  const before = keyedCollection(section, current.sections[section]);
  const after = keyedCollection(section, incoming.sections[section]);
  const beforeByKey = new Map(before.map((item) => [item.key, item]));
  const afterByKey = new Map(after.map((item) => [item.key, item]));
  const allChanges: PortfolioPackChange[] = [];

  for (const item of after) {
    const previous = beforeByKey.get(item.key);
    if (!previous) {
      allChanges.push({ action: "add", key: item.key, label: item.label });
    } else if (canonical(previous.value) !== canonical(item.value)) {
      allChanges.push({ action: "replace", key: item.key, label: item.label });
    }
  }
  for (const item of before) {
    if (!afterByKey.has(item.key)) {
      allChanges.push({ action: "remove", key: item.key, label: item.label });
    }
  }

  return {
    section,
    current: before.length,
    incoming: after.length,
    added: allChanges.filter((change) => change.action === "add").length,
    replaced: allChanges.filter((change) => change.action === "replace").length,
    removed: allChanges.filter((change) => change.action === "remove").length,
    changes: allChanges.slice(0, MAX_CHANGES_PER_SECTION),
    changesTruncated: allChanges.length > MAX_CHANGES_PER_SECTION,
    selected,
    recommended,
  };
}

function summary(input: ReadinessInput): PortfolioPackReadinessSummary {
  const report = buildReadinessReport(input);
  return {
    score: report.score,
    readyToShare: report.readyToShare,
    counts: report.counts,
  };
}

function profileFromPack(
  pack: PortfolioPackV1,
  fallback: ReadinessProfile | null,
): ReadinessProfile {
  return {
    ...pack.sections.profile,
    defaultLocale: pack.sections.appearance.defaultLocale || fallback?.defaultLocale || "zh",
  };
}

function projectedKnowledgeBases(
  current: ReadinessKnowledgeBase[],
  pack: PortfolioPackV1,
): ReadinessKnowledgeBase[] {
  const existing = new Map(current.map((item) => [item.slug, item]));
  return pack.sections.knowledgeBases.map((item, index) => {
    const preserved = existing.get(item.slug);
    return {
      id: preserved?.id ?? `portfolio-pack-kb-${index}`,
      ...item,
      cogdocKbId: preserved?.cogdocKbId ?? "",
      enabled: preserved?.enabled ?? false,
    };
  });
}

export function projectPortfolioPackReadinessInput(
  current: ReadinessInput,
  projected: PortfolioPackV1,
  selection: readonly PortfolioPackSection[],
): ReadinessInput {
  const selected = new Set(selection);
  const profileSelected = selected.has("profile") || selected.has("appearance");
  return {
    ...current,
    profile: profileSelected ? profileFromPack(projected, current.profile) : current.profile,
    socialLinks: selected.has("socialLinks")
      ? projected.sections.socialLinks.map((item, index) => ({ id: `portfolio-pack-link-${index}`, ...item }))
      : current.socialLinks,
    focusAreas: selected.has("focusAreas")
      ? projected.sections.focusAreas.map((item, index) => ({ id: `portfolio-pack-focus-${index}`, ...item }))
      : current.focusAreas,
    experiences: selected.has("experiences")
      ? projected.sections.experiences.map((item, index) => ({ id: `portfolio-pack-exp-${index}`, ...item }))
      : current.experiences,
    projects: selected.has("projects")
      ? projected.sections.projects.map((item, index) => ({ id: `portfolio-pack-project-${index}`, ...item }))
      : current.projects,
    posts: selected.has("posts")
      ? projected.sections.posts.map((item, index) => ({ id: `portfolio-pack-post-${index}`, ...item }))
      : current.posts,
    knowledgeBases: selected.has("knowledgeBases")
      ? projectedKnowledgeBases(current.knowledgeBases, projected)
      : current.knowledgeBases,
  };
}

function issue(
  code: string,
  detail: string,
  section?: PortfolioPackSection,
  subject?: string,
): PortfolioPackIssue {
  return { code, severity: "warning", detail, section, subject };
}

export function createPortfolioPackPreviewPlan(
  input: PortfolioPackPlanInput,
): PortfolioPackPreviewPlan {
  const current = parsePortfolioPack(input.current);
  const incoming = parsePortfolioPack(input.incoming);
  const selectedSections = PORTFOLIO_PACK_SECTIONS.filter((section) =>
    (input.selection ?? PORTFOLIO_PACK_SECTIONS).includes(section),
  );
  const selected = new Set(selectedSections);
  const recommendedSelection = PORTFOLIO_PACK_SECTIONS.filter((section) =>
    isPortfolioPackSectionEmptyOrDemoOnly(current, section),
  );
  const recommended = new Set(recommendedSelection);
  const normalized = mergePortfolioPackSelection(current, incoming, selectedSections);
  const projected = normalized.pack;
  const sections = PORTFOLIO_PACK_SECTIONS.map((section) => {
    if (section === "profile") {
      return singletonPlan(section, current, projected, PROFILE_FIELDS, selected.has(section), recommended.has(section));
    }
    if (section === "appearance") {
      return singletonPlan(section, current, projected, APPEARANCE_FIELDS, selected.has(section), recommended.has(section));
    }
    return collectionPlan(section, current, projected, selected.has(section), recommended.has(section));
  });

  // Scan only selected media-bearing sections. Otherwise a large unselected
  // article collection could consume the bounded character/result budget and
  // hide references from the section the admin is actually applying.
  const mediaCandidate = structuredClone(projected);
  if (!selected.has("profile")) mediaCandidate.sections.profile.avatarUrl = "";
  if (!selected.has("projects")) mediaCandidate.sections.projects = [];
  if (!selected.has("posts")) mediaCandidate.sections.posts = [];
  const mediaScan = collectPortfolioPackMediaReferences(mediaCandidate);
  const mediaReferences = mediaScan.references;
  const warnings: PortfolioPackIssue[] = [];
  for (const section of selectedSections) {
    if (!recommended.has(section)) {
      warnings.push(issue(
        "real-content-replacement",
        "目标栏目包含非 demo 内容；应用后将按预览清单整栏替换。",
        section,
      ));
    }
  }
  const localUploads = mediaReferences.filter((reference) => reference.kind === "local-upload");
  const externalMedia = mediaReferences.filter((reference) => reference.kind === "external");
  if (localUploads.length > 0) {
    warnings.push(issue(
      "local-media-not-bundled",
      `内容包引用了 ${localUploads.length} 个 /uploads 媒体地址；JSON 不包含文件字节，跨实例时需单独迁移。`,
    ));
  }
  if (externalMedia.length > 0) {
    warnings.push(issue(
      "external-media-reference",
      `内容包引用了 ${externalMedia.length} 个外部媒体地址；应用过程不会下载或验证这些资源。`,
    ));
  }
  if (mediaScan.truncated) {
    warnings.push(issue(
      "media-scan-truncated",
      "媒体引用扫描达到安全上限，预览只展示了部分引用；应用前请手动核对所选栏目的正文与图片字段。",
    ));
  }
  if (selected.has("knowledgeBases")) {
    warnings.push(issue(
      "knowledge-bindings-excluded",
      "知识库内容包不包含 CogDoc KB ID、启用状态或同步元数据；同 slug 模块保留本机绑定，新模块默认停用。",
      "knowledgeBases",
    ));
  }
  for (const adjustment of normalized.adjustments) {
    warnings.push(issue(
      `publication-${adjustment.action}`,
      `${adjustment.label}：${adjustment.reasons.join("；")}`,
      adjustment.section,
      adjustment.label,
    ));
  }

  const readiness = input.readinessInput
    ? {
        before: summary(input.readinessInput),
        projected: summary(
          projectPortfolioPackReadinessInput(
            input.readinessInput,
            projected,
            selectedSections,
          ),
        ),
      }
    : undefined;

  return {
    version: PORTFOLIO_PACK_VERSION,
    fingerprint: createPortfolioPackFingerprint(
      current,
      projected,
      selectedSections,
      input.interlockSalt,
    ),
    sections,
    warnings,
    blockers: [],
    mediaReferences,
    mediaReferencesTruncated: mediaScan.truncated,
    publicationAdjustments: normalized.adjustments,
    recommendedSelection,
    selectedSections,
    readiness,
  };
}
