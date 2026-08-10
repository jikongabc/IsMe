import { z } from "zod";
import {
  PORTFOLIO_PACK_SECTIONS,
  type PortfolioPackSection,
} from "@/lib/portfolio-pack";

// The JSON file itself is capped at 4 MiB. Route envelopes add section and
// confirmation metadata, so reserve a small bounded allowance for that wrapper.
export const PORTFOLIO_PACK_REQUEST_MAX_BYTES = 4 * 1024 * 1024 + 64 * 1024;

const sectionSchema = z.enum(PORTFOLIO_PACK_SECTIONS);

export const sectionSelectionSchema = z
  .array(sectionSchema)
  .min(1)
  .max(PORTFOLIO_PACK_SECTIONS.length)
  .superRefine((sections, context) => {
    if (new Set(sections).size !== sections.length) {
      context.addIssue({
        code: "custom",
        message: "sections must be unique",
      });
    }
  });

const fingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "planFingerprint must be a SHA-256 hex digest");

export const portfolioPackPreviewRequestSchema = z
  .object({
    pack: z.unknown(),
    sections: sectionSelectionSchema,
  })
  .strict();

export const portfolioPackImportRequestSchema = z
  .object({
    pack: z.unknown(),
    sections: sectionSelectionSchema,
    confirmation: z.literal("IMPORT PORTFOLIO PACK"),
    planFingerprint: fingerprintSchema,
  })
  .strict();

export const demoCleanupRequestSchema = z
  .object({
    confirmation: z.literal("REMOVE DEMO CONTENT"),
    planFingerprint: fingerprintSchema,
  })
  .strict();

export type PortfolioPackPreviewRequest = {
  pack: unknown;
  sections: PortfolioPackSection[];
};

export type PortfolioPackImportRequest = PortfolioPackPreviewRequest & {
  confirmation: "IMPORT PORTFOLIO PACK";
  planFingerprint: string;
};
