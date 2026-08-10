import {
  PORTFOLIO_PACK_SECTIONS,
  PORTFOLIO_PACK_VERSION,
  type PortfolioPackSection,
} from "@/lib/portfolio-pack";
import { PORTFOLIO_BUNDLE_VERSION } from "@/lib/portfolio-bundle/types";

export { PORTFOLIO_PACK_VERSION };
export const MAX_PORTFOLIO_PACK_BYTES = 4 * 1024 * 1024;
export const MAX_PORTFOLIO_BUNDLE_BYTES = 48 * 1024 * 1024;
export const MAX_STORED_DRAFT_BYTES = 750 * 1024;
export const STUDIO_DRAFT_STORAGE_KEY = "isme.launch-studio.portfolio-pack.v1";

const sectionCopy: Record<PortfolioPackSection, { label: string; description: string }> = {
  profile: { label: "身份资料", description: "姓名、定位、简介和公开联系方式" },
  appearance: { label: "外观", description: "默认语言、主题和公开配色" },
  socialLinks: { label: "社交链接", description: "GitHub、邮箱与其他公开入口" },
  focusAreas: { label: "能力方向", description: "技能主题、说明和关键词" },
  experiences: { label: "履历", description: "工作、教育、竞赛和其他经历" },
  projects: { label: "项目案例", description: "案例叙事、结果、取舍和图片证据" },
  posts: { label: "文章", description: "公开文章及其发布状态" },
  knowledgeBases: { label: "知识库模块", description: "公开模块文案，不包含服务密钥" },
};

export const portfolioSections = PORTFOLIO_PACK_SECTIONS.map((key) => ({
  key,
  ...sectionCopy[key],
}));

export type PortfolioSectionKey = PortfolioPackSection;

export type SnapshotSection = {
  key: PortfolioSectionKey;
  count: number;
  demoCount: number;
  realCount: number;
};

export type ParsedPackDraft = {
  pack: Record<string, unknown>;
  bundle: Record<string, unknown> | null;
  format: "pack" | "bundle";
  assetCount: number;
  assetBytes: number;
  text: string;
  bytes: number;
  sections: PortfolioSectionKey[];
};

export type ParsePackDraftResult =
  | { ok: true; value: ParsedPackDraft }
  | { ok: false; error: string };

export type StoredStudioDraft = {
  storageVersion: 1;
  text: string;
  selectedSections: PortfolioSectionKey[];
  savedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function hasSectionContent(sections: Record<string, unknown>, key: PortfolioSectionKey) {
  return key in sections;
}

export function parsePortfolioPackDraft(text: string): ParsePackDraftResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "请粘贴或选择 portfolio-pack.v1 JSON 文件。" };

  const bytes = byteLength(trimmed);
  if (bytes > MAX_PORTFOLIO_BUNDLE_BYTES) {
    return {
      ok: false,
      error: `文件超过浏览器初筛上限 ${MAX_PORTFOLIO_BUNDLE_BYTES / 1024 / 1024} MiB。`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "JSON 无法解析，请检查括号、引号和逗号。" };
  }
  if (!isRecord(parsed)) return { ok: false, error: "portfolio pack 顶层必须是 JSON 对象。" };

  const version = parsed.version;
  const bundle = version === PORTFOLIO_BUNDLE_VERSION ? parsed : null;
  const pack = bundle && isRecord(bundle.pack) ? bundle.pack : parsed;
  if (pack.version !== PORTFOLIO_PACK_VERSION) {
    return {
      ok: false,
      error: version
        ? `不支持 ${version}；当前接收 ${PORTFOLIO_PACK_VERSION} 或 ${PORTFOLIO_BUNDLE_VERSION}。`
        : "缺少受支持的版本标记。",
    };
  }

  if (!bundle && bytes > MAX_PORTFOLIO_PACK_BYTES) {
    return {
      ok: false,
      error: `普通内容包超过 ${MAX_PORTFOLIO_PACK_BYTES / 1024 / 1024} MiB 上限。`,
    };
  }
  const bundleAssets = bundle?.assets;
  if (bundle && !Array.isArray(bundleAssets)) {
    return { ok: false, error: "自包含站点包缺少 assets 数组。" };
  }
  const assetCount = Array.isArray(bundleAssets) ? bundleAssets.length : 0;
  let assetBytes = 0;
  if (Array.isArray(bundleAssets)) {
    for (const asset of bundleAssets) {
      if (!isRecord(asset) || typeof asset.bytes !== "number" || !Number.isSafeInteger(asset.bytes)) {
        return { ok: false, error: "自包含站点包的媒体清单格式无效。" };
      }
      assetBytes += asset.bytes;
    }
  }

  const packSections = isRecord(pack.sections) ? pack.sections : null;
  if (!packSections) {
    return { ok: false, error: "缺少 sections 栏目对象。" };
  }
  const sections = portfolioSections
    .map((section) => section.key)
    .filter((key) => hasSectionContent(packSections, key));
  if (sections.length === 0) {
    return { ok: false, error: "没有找到可审阅的公开内容栏目。" };
  }

  return {
    ok: true,
    value: {
      pack,
      bundle,
      format: bundle ? "bundle" : "pack",
      assetCount,
      assetBytes,
      text: trimmed,
      bytes,
      sections,
    },
  };
}

/**
 * Empty and demo-only destinations are safe defaults. Any destination that
 * already contains real content stays opt-in even when it also contains demo rows.
 */
export function defaultSelectedSections(
  available: PortfolioSectionKey[],
  snapshot: SnapshotSection[],
  recommendedSelection?: PortfolioSectionKey[],
): PortfolioSectionKey[] {
  const recommended = recommendedSelection
    ? new Set(recommendedSelection)
    : null;
  return available.filter((key) => {
    const current = snapshot.find((section) => section.key === key);
    if (!current) return false;
    if (recommended && !recommended.has(key)) return false;
    return current.realCount === 0 && (current.count === 0 || current.demoCount > 0);
  });
}

export function encodeStoredStudioDraft(
  text: string,
  selectedSections: PortfolioSectionKey[],
  savedAt = new Date().toISOString(),
) {
  if (!canPersistStudioDraft(text)) return null;
  const value: StoredStudioDraft = {
    storageVersion: 1,
    text,
    selectedSections: portfolioSections
      .map((section) => section.key)
      .filter((key) => selectedSections.includes(key)),
    savedAt,
  };
  return JSON.stringify(value);
}

export function decodeStoredStudioDraft(value: string | null): StoredStudioDraft | null {
  if (!value || byteLength(value) > MAX_STORED_DRAFT_BYTES * 2 + 4096) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.storageVersion !== 1 || typeof parsed.text !== "string") {
      return null;
    }
    const draft = parsePortfolioPackDraft(parsed.text);
    if (!draft.ok) return null;
    const storedSelections = Array.isArray(parsed.selectedSections) ? parsed.selectedSections : [];
    const selected = storedSelections.length > 0
      ? portfolioSections
          .map((section) => section.key)
          .filter((key) => storedSelections.includes(key))
      : [];
    return {
      storageVersion: 1,
      text: draft.value.text,
      selectedSections: selected,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function canPersistStudioDraft(text: string) {
  return byteLength(text) <= MAX_STORED_DRAFT_BYTES;
}

type StorageWriter = {
  setItem(key: string, value: string): void;
};

export function tryStoreStudioDraft(storage: StorageWriter, value: string) {
  try {
    storage.setItem(STUDIO_DRAFT_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
