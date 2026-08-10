import { z } from "zod";
import {
  isStrongAdminPassword,
  isStrongSessionSecret,
} from "@/lib/auth/credential-policy";

const envSchema = z.object({
  ADMIN_PASSWORD: z.string().min(15, "ADMIN_PASSWORD must be at least 15 characters"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ISME_DATABASE_PATH: z.string().min(1).default("./data/isme.db"),
  COGDOC_API_URL: z.string().optional().default(""),
  COGDOC_API_KEY: z.string().optional().default(""),
  COGDOC_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  /** Comma-separated IPs. Empty = allow all admin access. */
  ADMIN_IP_ALLOWLIST: z.string().optional().default(""),
  /** S3-compatible object storage. Leave empty to use local public/uploads. */
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_BASE_URL: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .default(""),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function productionCredentialIssues(
  env: Pick<ServerEnv, "ADMIN_PASSWORD" | "SESSION_SECRET">,
  nodeEnv = process.env.NODE_ENV,
): string[] {
  if (nodeEnv !== "production") return [];

  const issues: string[] = [];
  if (!isStrongAdminPassword(env.ADMIN_PASSWORD)) issues.push("ADMIN_PASSWORD");
  if (!isStrongSessionSecret(env.SESSION_SECRET)) issues.push("SESSION_SECRET");
  return issues;
}

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
    ISME_DATABASE_PATH: process.env.ISME_DATABASE_PATH,
    COGDOC_API_URL: process.env.COGDOC_API_URL ?? "",
    COGDOC_API_KEY: process.env.COGDOC_API_KEY ?? "",
    COGDOC_TIMEOUT_MS: process.env.COGDOC_TIMEOUT_MS,
    // Server-only so Docker can provide the deployed domain at runtime.
    // Keep the old public name as a compatibility fallback for local setups.
    SITE_URL: process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
    ADMIN_IP_ALLOWLIST: process.env.ADMIN_IP_ALLOWLIST ?? "",
    S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
    S3_REGION: process.env.S3_REGION ?? "auto",
    S3_BUCKET: process.env.S3_BUCKET ?? "",
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "",
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "",
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL ?? "",
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "",
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }

  const unsafeCredentials = productionCredentialIssues(parsed.data);
  if (unsafeCredentials.length > 0) {
    throw new Error(
      `Unsafe production credentials: replace ${unsafeCredentials.join(", ")} before starting the server`,
    );
  }

  cached = parsed.data;
  return cached;
}

export function isCogDocConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.COGDOC_API_URL?.trim());
}

/** True when bucket + credentials are set — uploads go to S3-compatible storage. */
export function isS3Configured(): boolean {
  const env = getEnv();
  return Boolean(
    env.S3_BUCKET?.trim() &&
      env.S3_ACCESS_KEY_ID?.trim() &&
      env.S3_SECRET_ACCESS_KEY?.trim(),
  );
}

export function isS3ForcePathStyle(): boolean {
  const raw = getEnv().S3_FORCE_PATH_STYLE.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
