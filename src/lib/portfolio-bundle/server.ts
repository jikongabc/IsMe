import "server-only";

import { createHash } from "node:crypto";
import { detectImageMime } from "@/lib/media/image-bytes";
import {
  listRegisteredMediaObjects,
  removeMedia,
  saveMediaWithName,
} from "@/lib/media/registry";
import { readMediaObject } from "@/lib/media/storage";
import {
  applyPortfolioPack,
  previewPortfolioPack,
  readCurrentPortfolioPack,
} from "@/lib/portfolio-pack/server";
import {
  collectPortfolioPackMediaReferences,
  type PortfolioPackApplyResult,
  type PortfolioPackIssue,
  type PortfolioPackSection,
} from "@/lib/portfolio-pack";
import type { ReadinessInput } from "@/lib/readiness/types";
import {
  PORTFOLIO_BUNDLE_MAX_ASSETS,
  PORTFOLIO_BUNDLE_MAX_ASSET_BYTES,
  PORTFOLIO_BUNDLE_MAX_TOTAL_ASSET_BYTES,
} from "./schema";
import {
  PortfolioBundleValidationError,
  preparePortfolioBundle,
} from "./media";
import {
  PORTFOLIO_BUNDLE_VERSION,
  type PortfolioBundlePreviewPlan,
  type PortfolioBundleSummary,
  type PortfolioBundleV1,
} from "./types";

export class PortfolioBundleExportError extends Error {}

const BUNDLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const);

function normalizedMediaUrl(value: string): string {
  if (value.startsWith("/uploads/")) return value.split(/[?#]/, 1)[0] ?? value;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

export async function createPortfolioBundle(): Promise<PortfolioBundleV1> {
  const pack = readCurrentPortfolioPack();
  const references = collectPortfolioPackMediaReferences(pack).references;
  const registered = await listRegisteredMediaObjects();
  const registeredByUrl = new Map(
    registered.map((item) => [normalizedMediaUrl(item.url), item]),
  );
  const uniqueReferences = [...new Set(references.map((item) => item.url))];
  const missingLocal = uniqueReferences.filter(
    (url) => url.startsWith("/uploads/") && !registeredByUrl.has(url),
  );
  if (missingLocal.length > 0) {
    throw new PortfolioBundleExportError(
      `${missingLocal.length} 个本地图片未注册或已丢失，请先在媒体库修复。`,
    );
  }
  const selected = uniqueReferences
    .map((url) => ({ url, media: registeredByUrl.get(url) }))
    .filter((item): item is { url: string; media: NonNullable<typeof item.media> } => Boolean(item.media));
  if (selected.length > PORTFOLIO_BUNDLE_MAX_ASSETS) {
    throw new PortfolioBundleExportError(
      `引用的受管媒体超过 ${PORTFOLIO_BUNDLE_MAX_ASSETS} 个，无法生成受限站点包。`,
    );
  }

  const assets: PortfolioBundleV1["assets"] = [];
  let totalBytes = 0;
  for (const { url, media } of selected) {
    const bytes = await readMediaObject(
      media.key,
      media.storage,
      PORTFOLIO_BUNDLE_MAX_ASSET_BYTES,
    );
    totalBytes += bytes.length;
    if (totalBytes > PORTFOLIO_BUNDLE_MAX_TOTAL_ASSET_BYTES) {
      throw new PortfolioBundleExportError("受管媒体总量超过 32 MiB，无法生成受限站点包。");
    }
    const contentType = detectImageMime(bytes);
    if (!contentType || !BUNDLE_IMAGE_TYPES.has(contentType as never)) {
      throw new PortfolioBundleExportError("受管媒体包含无法识别的图片格式。");
    }
    assets.push({
      sourceUrl: url,
      contentType: contentType as PortfolioBundleV1["assets"][number]["contentType"],
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      dataBase64: bytes.toString("base64"),
    });
  }

  return {
    version: PORTFOLIO_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    pack,
    assets,
  };
}

function bundleWarning(summary: PortfolioBundleSummary): PortfolioPackIssue | null {
  if (summary.importedAssetCount === 0) return null;
  return {
    code: "bundle-media-import",
    severity: "warning",
    detail: `将校验并写入 ${summary.importedAssetCount} 个受管图片（${summary.importedBytes} 字节）；同内容摘要使用稳定文件名。`,
  };
}

export function previewPortfolioBundle(
  bundle: unknown,
  selection: readonly PortfolioPackSection[],
  readinessInput: ReadinessInput,
): PortfolioBundlePreviewPlan {
  const prepared = preparePortfolioBundle({ bundle, selection });
  const plan = previewPortfolioPack(prepared.pack, selection, readinessInput);
  const warnings = plan.warnings.filter(
    (warning) => !["local-media-not-bundled", "external-media-reference"].includes(warning.code),
  );
  const imported = bundleWarning(prepared.summary);
  if (imported) warnings.push(imported);
  if (prepared.summary.externalReferenceCount > 0) {
    warnings.push({
      code: "external-media-reference",
      severity: "warning",
      detail: `仍有 ${prepared.summary.externalReferenceCount} 个外部媒体地址；导入过程不会下载或验证这些资源。`,
    });
  }
  return { ...plan, warnings, bundle: prepared.summary };
}

export async function applyPortfolioBundle(input: {
  bundle: unknown;
  selection: readonly PortfolioPackSection[];
  expectedFingerprint: string;
}): Promise<{
  result: PortfolioPackApplyResult;
  bundle: PortfolioBundleSummary;
}> {
  const prepared = preparePortfolioBundle({
    bundle: input.bundle,
    selection: input.selection,
  });
  const created: string[] = [];
  try {
    for (const asset of prepared.assets) {
      const saved = await saveMediaWithName(asset.fileName, asset.bytes, asset.contentType);
      if (saved.created) created.push(saved.stored.name);
    }
    const result = applyPortfolioPack({
      incoming: prepared.pack,
      selection: input.selection,
      expectedFingerprint: input.expectedFingerprint,
    });
    return { result, bundle: prepared.summary };
  } catch (error) {
    await Promise.allSettled(created.map((name) => removeMedia(name)));
    throw error;
  }
}

export { PortfolioBundleValidationError };
