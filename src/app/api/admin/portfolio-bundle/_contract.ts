import { z } from "zod";
import { sectionSelectionSchema } from "@/app/api/admin/portfolio-pack/_contract";
import { PORTFOLIO_BUNDLE_REQUEST_MAX_BYTES } from "@/lib/portfolio-bundle";

const fingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "planFingerprint must be a SHA-256 hex digest");

export { PORTFOLIO_BUNDLE_REQUEST_MAX_BYTES };

export const portfolioBundlePreviewRequestSchema = z
  .object({
    bundle: z.unknown(),
    sections: sectionSelectionSchema,
  })
  .strict();

export const portfolioBundleImportRequestSchema = z
  .object({
    bundle: z.unknown(),
    sections: sectionSelectionSchema,
    confirmation: z.literal("IMPORT PORTFOLIO BUNDLE"),
    planFingerprint: fingerprintSchema,
  })
  .strict();
