import { z } from "zod";
import { portfolioPackV1Schema } from "@/lib/portfolio-pack";
import {
  PORTFOLIO_BUNDLE_VERSION,
  type PortfolioBundleV1,
} from "./types";

export const PORTFOLIO_BUNDLE_MAX_ASSETS = 64;
export const PORTFOLIO_BUNDLE_MAX_ASSET_BYTES = 2 * 1024 * 1024;
export const PORTFOLIO_BUNDLE_MAX_TOTAL_ASSET_BYTES = 32 * 1024 * 1024;
export const PORTFOLIO_BUNDLE_MAX_FILE_BYTES = 48 * 1024 * 1024;
export const PORTFOLIO_BUNDLE_REQUEST_MAX_BYTES = PORTFOLIO_BUNDLE_MAX_FILE_BYTES + 256 * 1024;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const base64Schema = z
  .string()
  .min(16)
  .max(Math.ceil(PORTFOLIO_BUNDLE_MAX_ASSET_BYTES / 3) * 4 + 4)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

function isPortableMediaUrl(value: string): boolean {
  if (value.startsWith("/uploads/") && !value.includes("..") && !value.includes("\\")) {
    return true;
  }
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
    );
  } catch {
    return false;
  }
}

export const portfolioBundleAssetSchema = z
  .object({
    sourceUrl: z.string().min(1).max(500).refine(isPortableMediaUrl, "invalid media URL"),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    bytes: z.number().int().min(12).max(PORTFOLIO_BUNDLE_MAX_ASSET_BYTES),
    sha256: sha256Schema,
    dataBase64: base64Schema,
  })
  .strict();

export const portfolioBundleV1Schema: z.ZodType<PortfolioBundleV1> = z
  .object({
    version: z.literal(PORTFOLIO_BUNDLE_VERSION),
    exportedAt: z.string().datetime({ offset: true }),
    pack: portfolioPackV1Schema,
    assets: z.array(portfolioBundleAssetSchema).max(PORTFOLIO_BUNDLE_MAX_ASSETS),
  })
  .strict()
  .superRefine((bundle, context) => {
    const seen = new Set<string>();
    let totalBytes = 0;
    bundle.assets.forEach((asset, index) => {
      totalBytes += asset.bytes;
      if (seen.has(asset.sourceUrl)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "sourceUrl"],
          message: "duplicate sourceUrl",
        });
      }
      seen.add(asset.sourceUrl);
    });
    if (totalBytes > PORTFOLIO_BUNDLE_MAX_TOTAL_ASSET_BYTES) {
      context.addIssue({
        code: "too_big",
        origin: "array",
        maximum: PORTFOLIO_BUNDLE_MAX_TOTAL_ASSET_BYTES,
        inclusive: true,
        path: ["assets"],
        message: `bundle exceeds ${PORTFOLIO_BUNDLE_MAX_TOTAL_ASSET_BYTES} decoded media bytes`,
      });
    }
  });

export function safeParsePortfolioBundle(input: unknown) {
  return portfolioBundleV1Schema.safeParse(input);
}
