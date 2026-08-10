import type {
  PortfolioPackPreviewPlan,
  PortfolioPackSection,
  PortfolioPackV1,
} from "@/lib/portfolio-pack";

export const PORTFOLIO_BUNDLE_VERSION = "portfolio-bundle.v1" as const;

export type PortfolioBundleAsset = {
  sourceUrl: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  bytes: number;
  sha256: string;
  dataBase64: string;
};

export type PortfolioBundleV1 = {
  version: typeof PORTFOLIO_BUNDLE_VERSION;
  exportedAt: string;
  pack: PortfolioPackV1;
  assets: PortfolioBundleAsset[];
};

export type PortfolioBundleSummary = {
  assetCount: number;
  totalBytes: number;
  importedAssetCount: number;
  importedBytes: number;
  externalReferenceCount: number;
};

export type PortfolioBundlePreviewPlan = PortfolioPackPreviewPlan & {
  bundle: PortfolioBundleSummary;
};

export type PreparedPortfolioBundle = {
  bundle: PortfolioBundleV1;
  pack: PortfolioPackV1;
  assets: Array<{
    sourceUrl: string;
    destinationUrl: string;
    fileName: string;
    contentType: PortfolioBundleAsset["contentType"];
    bytes: Buffer;
    sha256: string;
  }>;
  summary: PortfolioBundleSummary;
};

export type PortfolioBundlePrepareInput = {
  bundle: unknown;
  selection: readonly PortfolioPackSection[];
};
