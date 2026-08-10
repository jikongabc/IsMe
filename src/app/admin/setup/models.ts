import {
  PORTFOLIO_PACK_SECTIONS,
  PORTFOLIO_PACK_VERSION,
  type PortfolioPackSection,
} from "@/lib/portfolio-pack";
import type { ReadinessReport } from "@/lib/readiness/types";
import type { SnapshotSection } from "./state";

export type SetupSnapshot = {
  hasDemoContent: boolean;
  totalCount: number;
  sections: SnapshotSection[];
  recommendedSelection: PortfolioPackSection[];
};

export type ReadinessSummary = {
  score: number;
  readyToShare: boolean;
  counts: { pass: number; warning: number; blocker: number };
  items: Array<{
    id: string;
    status: "pass" | "warning" | "blocker";
    title: string;
    detail: string;
    action?: { label: string; href: string };
  }>;
};

export type PlanChange = {
  action: "add" | "replace" | "remove";
  key: string;
  label: string;
  fields?: string[];
  from?: string;
  to?: string;
};

export type PlanSection = {
  key: PortfolioPackSection;
  current: number;
  incoming: number;
  added: number;
  replaced: number;
  removed: number;
  changes: PlanChange[];
  changesTruncated: boolean;
  selected: boolean;
  recommended: boolean;
};

export type ReviewPlan = {
  fingerprint: string;
  sections: PlanSection[];
  warnings: string[];
  blockers: string[];
  mediaReferenceCount: number;
  mediaReferencesTruncated: boolean;
  publicationAdjustments: string[];
  recommendedSelection: PortfolioPackSection[];
  selectedSections: PortfolioPackSection[];
  readinessBefore: ReadinessSummary | null;
  readinessAfter: ReadinessSummary | null;
  bundle: {
    assetCount: number;
    totalBytes: number;
    importedAssetCount: number;
    importedBytes: number;
    externalReferenceCount: number;
  } | null;
};

const sectionKeys = new Set<string>(PORTFOLIO_PACK_SECTIONS);
const planFingerprintPattern = /^[a-f0-9]{64}$/;
const readinessStatuses = new Set(["pass", "warning", "blocker"]);
const readinessCategories = new Set([
  "identity",
  "portfolio",
  "experience",
  "content",
  "deployment",
  "knowledge",
  "links",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSectionKey(value: unknown): value is PortfolioPackSection {
  return typeof value === "string" && sectionKeys.has(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function strictStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value as string[];
}

function strictSectionList(value: unknown): PortfolioPackSection[] | null {
  if (!Array.isArray(value) || !value.every(isSectionKey)) return null;
  const sections = value as PortfolioPackSection[];
  return new Set(sections).size === sections.length ? sections : null;
}

function parseCounts(value: unknown) {
  if (!isRecord(value)) return null;
  const { pass, warning, blocker } = value;
  if (!isCount(pass) || !isCount(warning) || !isCount(blocker)) return null;
  return { pass, warning, blocker };
}

function parseReadinessProjection(value: unknown): ReadinessSummary | null {
  if (!isRecord(value) || !isScore(value.score) || typeof value.readyToShare !== "boolean") {
    return null;
  }
  const counts = parseCounts(value.counts);
  if (!counts) return null;
  return {
    score: value.score,
    readyToShare: value.readyToShare,
    counts,
    items: [],
  };
}

function parseReadinessItem(value: unknown): ReadinessSummary["items"][number] | null {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || !readinessCategories.has(String(value.category))
    || !readinessStatuses.has(String(value.status))
    || typeof value.title !== "string"
    || typeof value.detail !== "string"
    || typeof value.weight !== "number"
    || !Number.isFinite(value.weight)
  ) {
    return null;
  }
  let action: { label: string; href: string } | undefined;
  if (value.action !== undefined) {
    if (
      !isRecord(value.action)
      || typeof value.action.label !== "string"
      || typeof value.action.href !== "string"
      || !value.action.href.startsWith("/admin")
    ) {
      return null;
    }
    action = { label: value.action.label, href: value.action.href };
  }
  return {
    id: value.id,
    status: value.status as "pass" | "warning" | "blocker",
    title: value.title,
    detail: value.detail,
    action,
  };
}

export function normalizeReadiness(value: unknown): ReadinessSummary | null {
  if (
    !isRecord(value)
    || typeof value.generatedAt !== "string"
    || !isScore(value.score)
    || typeof value.readyToShare !== "boolean"
    || !Array.isArray(value.items)
  ) {
    return null;
  }
  const counts = parseCounts(value.counts);
  if (!counts) return null;
  const items = value.items.map(parseReadinessItem);
  if (items.some((item) => item === null)) return null;
  return {
    score: value.score,
    readyToShare: value.readyToShare,
    counts,
    items: items as ReadinessSummary["items"],
  };
}

export function projectReadiness(report: ReadinessReport): ReadinessSummary {
  const projected = normalizeReadiness(report);
  if (!projected) throw new Error("Readiness report does not match its declared contract.");
  return projected;
}

export function normalizeSetupSnapshot(value: unknown): SetupSnapshot | null {
  if (
    !isRecord(value)
    || !isRecord(value.counts)
    || !isRecord(value.demoExactMatchCounts)
    || typeof value.hasPlaceholders !== "boolean"
    || typeof value.hasRealContent !== "boolean"
    || !["zh", "en"].includes(String(value.defaultLocale))
    || !isRecord(value.mediaWarningCounts)
    || !isCount(value.mediaWarningCounts.localUploads)
    || !isCount(value.mediaWarningCounts.external)
    || !isCount(value.mediaWarningCounts.total)
    || typeof value.mediaWarningCounts.truncated !== "boolean"
    || !parseReadinessProjection(value.beforeReadiness)
  ) {
    return null;
  }
  const recommendedSelection = strictSectionList(value.recommendedSelection);
  if (!recommendedSelection) return null;
  const sections: SnapshotSection[] = [];
  for (const key of PORTFOLIO_PACK_SECTIONS) {
    const count = value.counts[key];
    const demoCount = value.demoExactMatchCounts[key];
    if (!isCount(count) || !isCount(demoCount) || demoCount > count) return null;
    sections.push({ key, count, demoCount, realCount: count - demoCount });
  }
  return {
    hasDemoContent:
      value.hasPlaceholders || sections.some((section) => section.demoCount > 0),
    totalCount: sections.reduce((total, section) => total + section.count, 0),
    sections,
    recommendedSelection,
  };
}

function parsePlanChange(value: unknown): PlanChange | null {
  if (
    !isRecord(value)
    || !["add", "replace", "remove"].includes(String(value.action))
    || typeof value.key !== "string"
    || typeof value.label !== "string"
  ) {
    return null;
  }
  const fields = value.fields === undefined ? undefined : strictStringList(value.fields);
  if (fields === null || (value.from !== undefined && typeof value.from !== "string")
    || (value.to !== undefined && typeof value.to !== "string")) {
    return null;
  }
  return {
    action: value.action as PlanChange["action"],
    key: value.key,
    label: value.label,
    fields,
    from: value.from as string | undefined,
    to: value.to as string | undefined,
  };
}

function parsePlanSection(value: unknown): PlanSection | null {
  if (
    !isRecord(value)
    || !isSectionKey(value.section)
    || !isCount(value.current)
    || !isCount(value.incoming)
    || !isCount(value.added)
    || !isCount(value.replaced)
    || !isCount(value.removed)
    || !Array.isArray(value.changes)
    || typeof value.changesTruncated !== "boolean"
    || typeof value.selected !== "boolean"
    || typeof value.recommended !== "boolean"
  ) {
    return null;
  }
  const changes = value.changes.map(parsePlanChange);
  if (changes.some((change) => change === null)) return null;
  return {
    key: value.section,
    current: value.current,
    incoming: value.incoming,
    added: value.added,
    replaced: value.replaced,
    removed: value.removed,
    changes: changes as PlanChange[],
    changesTruncated: value.changesTruncated,
    selected: value.selected,
    recommended: value.recommended,
  };
}

function parseIssueList(value: unknown, severity: "warning" | "blocker"): string[] | null {
  if (!Array.isArray(value)) return null;
  const details: string[] = [];
  for (const issue of value) {
    if (
      !isRecord(issue)
      || typeof issue.code !== "string"
      || issue.severity !== severity
      || typeof issue.detail !== "string"
      || (issue.section !== undefined && !isSectionKey(issue.section))
      || (issue.subject !== undefined && typeof issue.subject !== "string")
    ) {
      return null;
    }
    details.push(issue.detail);
  }
  return details;
}

function parseMediaReferences(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  for (const reference of value) {
    if (
      !isRecord(reference)
      || !["local-upload", "external"].includes(String(reference.kind))
      || typeof reference.url !== "string"
      || !["profile", "projects", "posts"].includes(String(reference.section))
      || typeof reference.subject !== "string"
      || typeof reference.field !== "string"
    ) {
      return null;
    }
  }
  return value.length;
}

function parsePublicationAdjustments(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const adjustments: string[] = [];
  for (const adjustment of value) {
    if (
      !isRecord(adjustment)
      || !["demote-to-draft", "assign-published-at"].includes(String(adjustment.action))
      || !["projects", "posts"].includes(String(adjustment.section))
      || typeof adjustment.slug !== "string"
      || typeof adjustment.label !== "string"
      || adjustment.from !== "published"
      || !["draft", "published"].includes(String(adjustment.to))
    ) {
      return null;
    }
    const reasons = strictStringList(adjustment.reasons);
    if (!reasons) return null;
    const action = adjustment.action === "demote-to-draft"
      ? "调整为草稿"
      : "补齐发布时间";
    adjustments.push(
      `${adjustment.label}：${action}${reasons.length > 0 ? `（${reasons.join("；")}）` : ""}`,
    );
  }
  return adjustments;
}

export function normalizeReviewPlan(value: unknown): ReviewPlan | null {
  if (
    !isRecord(value)
    || value.version !== PORTFOLIO_PACK_VERSION
    || typeof value.fingerprint !== "string"
    || !planFingerprintPattern.test(value.fingerprint)
    || !Array.isArray(value.sections)
    || typeof value.mediaReferencesTruncated !== "boolean"
  ) {
    return null;
  }
  const sections = value.sections.map(parsePlanSection);
  const warnings = parseIssueList(value.warnings, "warning");
  const blockers = parseIssueList(value.blockers, "blocker");
  const mediaReferenceCount = parseMediaReferences(value.mediaReferences);
  const publicationAdjustments = parsePublicationAdjustments(value.publicationAdjustments);
  const recommendedSelection = strictSectionList(value.recommendedSelection);
  const selectedSections = strictSectionList(value.selectedSections);
  if (
    sections.length !== PORTFOLIO_PACK_SECTIONS.length
    || sections.some((section) => section === null)
    || new Set(sections.map((section) => section?.key)).size !== sections.length
    || PORTFOLIO_PACK_SECTIONS.some(
      (key) => !sections.some((section) => section?.key === key),
    )
    || !warnings
    || !blockers
    || mediaReferenceCount === null
    || !publicationAdjustments
    || !recommendedSelection
    || !selectedSections
  ) {
    return null;
  }

  let readinessBefore: ReadinessSummary | null = null;
  let readinessAfter: ReadinessSummary | null = null;
  if (value.readiness !== undefined) {
    if (!isRecord(value.readiness)) return null;
    readinessBefore = parseReadinessProjection(value.readiness.before);
    readinessAfter = parseReadinessProjection(value.readiness.projected);
    if (!readinessBefore || !readinessAfter) return null;
  }

  let bundle: ReviewPlan["bundle"] = null;
  if (value.bundle !== undefined) {
    if (
      !isRecord(value.bundle)
      || !isCount(value.bundle.assetCount)
      || !isCount(value.bundle.totalBytes)
      || !isCount(value.bundle.importedAssetCount)
      || !isCount(value.bundle.importedBytes)
      || !isCount(value.bundle.externalReferenceCount)
      || value.bundle.importedAssetCount > value.bundle.assetCount
      || value.bundle.importedBytes > value.bundle.totalBytes
    ) {
      return null;
    }
    bundle = {
      assetCount: value.bundle.assetCount,
      totalBytes: value.bundle.totalBytes,
      importedAssetCount: value.bundle.importedAssetCount,
      importedBytes: value.bundle.importedBytes,
      externalReferenceCount: value.bundle.externalReferenceCount,
    };
  }

  return {
    fingerprint: value.fingerprint,
    sections: sections as PlanSection[],
    warnings,
    blockers,
    mediaReferenceCount,
    mediaReferencesTruncated: value.mediaReferencesTruncated,
    publicationAdjustments,
    recommendedSelection,
    selectedSections,
    readinessBefore,
    readinessAfter,
    bundle,
  };
}

export function isValidApplyReceipt(
  value: unknown,
  expectedFingerprint: string,
  expectedSections: PortfolioPackSection[],
) {
  if (
    !isRecord(value)
    || value.version !== PORTFOLIO_PACK_VERSION
    || typeof value.appliedAt !== "string"
    || !value.appliedAt
    || value.fingerprint !== expectedFingerprint
    || !planFingerprintPattern.test(expectedFingerprint)
    || !Array.isArray(value.sections)
  ) {
    return false;
  }
  const selectedSections = strictSectionList(value.selectedSections);
  if (
    !selectedSections
    || selectedSections.length !== expectedSections.length
    || !selectedSections.every((section) => expectedSections.includes(section))
  ) {
    return false;
  }
  const sections = value.sections.map(parsePlanSection);
  if (
    sections.length === 0
    || sections.some((section) => section === null)
    || new Set(sections.map((section) => section?.key)).size !== sections.length
    || !parseIssueList(value.warnings, "warning")
    || !parsePublicationAdjustments(value.publicationAdjustments)
  ) {
    return false;
  }
  return value.readiness === undefined || parseReadinessProjection(value.readiness) !== null;
}
