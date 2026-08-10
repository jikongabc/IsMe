import { createHash } from "node:crypto";
import { detectImageMime } from "@/lib/media/image-bytes";
import { extensionForContentType } from "@/lib/media/keys";
import { describeMediaObject } from "@/lib/media/storage";
import {
  collectPortfolioPackMediaReferences,
  parsePortfolioPack,
  PORTFOLIO_PACK_SECTIONS,
  type PortfolioPackSection,
  type PortfolioPackV1,
} from "@/lib/portfolio-pack";
import { portfolioBundleV1Schema } from "./schema";
import type {
  PortfolioBundlePrepareInput,
  PreparedPortfolioBundle,
} from "./types";

export class PortfolioBundleValidationError extends Error {}

function selectedMediaReferences(
  pack: PortfolioPackV1,
  selection: readonly PortfolioPackSection[],
) {
  const selected = new Set(selection);
  const candidate = structuredClone(pack);
  if (!selected.has("profile")) candidate.sections.profile.avatarUrl = "";
  if (!selected.has("projects")) candidate.sections.projects = [];
  if (!selected.has("posts")) candidate.sections.posts = [];
  return collectPortfolioPackMediaReferences(candidate).references;
}

function replaceAll(value: string, replacements: ReadonlyMap<string, string>): string {
  let result = value;
  for (const [source, destination] of replacements) {
    if (source !== destination && result.includes(source)) {
      result = result.split(source).join(destination);
    }
  }
  return result;
}

export function rewritePortfolioPackMediaUrls(
  input: PortfolioPackV1,
  replacements: ReadonlyMap<string, string>,
): PortfolioPackV1 {
  const pack = structuredClone(input);
  pack.sections.profile.avatarUrl = replacements.get(pack.sections.profile.avatarUrl)
    ?? pack.sections.profile.avatarUrl;
  for (const project of pack.sections.projects) {
    project.coverUrl = replacements.get(project.coverUrl) ?? project.coverUrl;
    project.gallery = project.gallery.map((item) => ({
      ...item,
      src: replacements.get(item.src) ?? item.src,
    }));
    project.description = replaceAll(project.description, replacements);
    project.descriptionEn = replaceAll(project.descriptionEn, replacements);
  }
  for (const post of pack.sections.posts) {
    post.coverUrl = replacements.get(post.coverUrl) ?? post.coverUrl;
    post.contentMarkdown = replaceAll(post.contentMarkdown, replacements);
    post.contentEn = replaceAll(post.contentEn, replacements);
  }
  return parsePortfolioPack(pack);
}

function decodeAsset(asset: {
  dataBase64: string;
  bytes: number;
  sha256: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}): Buffer {
  const bytes = Buffer.from(asset.dataBase64, "base64");
  if (bytes.length !== asset.bytes || bytes.toString("base64") !== asset.dataBase64) {
    throw new PortfolioBundleValidationError("媒体数据长度或 Base64 编码无效。");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new PortfolioBundleValidationError("媒体数据与 SHA-256 摘要不一致。");
  }
  if (detectImageMime(bytes) !== asset.contentType) {
    throw new PortfolioBundleValidationError("媒体数据与声明的图片类型不一致。");
  }
  return bytes;
}

export function preparePortfolioBundle(
  input: PortfolioBundlePrepareInput,
): PreparedPortfolioBundle {
  const parsed = portfolioBundleV1Schema.safeParse(input.bundle);
  if (!parsed.success) {
    throw new PortfolioBundleValidationError("自包含站点包格式无效。");
  }
  const selection = PORTFOLIO_PACK_SECTIONS.filter((section) => input.selection.includes(section));
  if (selection.length === 0) {
    throw new PortfolioBundleValidationError("至少选择一个栏目。");
  }
  const references = selectedMediaReferences(parsed.data.pack, selection);
  const selectedUrls = new Set(references.map((reference) => reference.url));
  const localUrls = new Set(
    references
      .filter((reference) => reference.kind === "local-upload")
      .map((reference) => reference.url),
  );
  const replacements = new Map<string, string>();
  const assets: PreparedPortfolioBundle["assets"] = [];
  let importedBytes = 0;

  for (const asset of parsed.data.assets) {
    const bytes = decodeAsset(asset);
    if (!selectedUrls.has(asset.sourceUrl)) continue;
    const fileName = `bundle-${asset.sha256}.${extensionForContentType(asset.contentType)}`;
    const destination = describeMediaObject(fileName);
    replacements.set(asset.sourceUrl, destination.url);
    assets.push({
      sourceUrl: asset.sourceUrl,
      destinationUrl: destination.url,
      fileName,
      contentType: asset.contentType,
      bytes,
      sha256: asset.sha256,
    });
    importedBytes += bytes.length;
    localUrls.delete(asset.sourceUrl);
  }

  if (localUrls.size > 0) {
    throw new PortfolioBundleValidationError(
      `站点包缺少 ${localUrls.size} 个所选栏目的 /uploads 图片，无法保证迁移后页面完整。`,
    );
  }

  const pack = rewritePortfolioPackMediaUrls(parsed.data.pack, replacements);
  return {
    bundle: parsed.data,
    pack,
    assets,
    summary: {
      assetCount: parsed.data.assets.length,
      totalBytes: parsed.data.assets.reduce((total, asset) => total + asset.bytes, 0),
      importedAssetCount: assets.length,
      importedBytes,
      externalReferenceCount: references.filter(
        (reference) => reference.kind === "external" && !replacements.has(reference.url),
      ).length,
    },
  };
}
