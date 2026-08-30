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
  COGDOC_ALLOW_INSECURE_HTTP: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .default(""),
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

export type CogDocApiUrlOptions = {
  nodeEnv?: string;
  allowInsecureHttp: boolean;
};

function hasAmbiguousCogDocAuthority(raw: string, url: URL): boolean {
  const authority = raw.slice(raw.indexOf("://") + 3).split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("\\")) return true;

  let rawHost = authority;
  let rawPort = "";
  if (authority.startsWith("[")) {
    const closing = authority.indexOf("]");
    if (closing < 0) return true;
    rawHost = authority.slice(0, closing + 1);
    if (authority.length > closing + 1) {
      if (authority[closing + 1] !== ":") return true;
      rawPort = authority.slice(closing + 2);
    }
  } else {
    const separator = authority.lastIndexOf(":");
    if (separator >= 0) {
      rawHost = authority.slice(0, separator);
      rawPort = authority.slice(separator + 1);
    }
  }

  if (rawPort && !/^(0|[1-9]\d{0,4})$/.test(rawPort)) return true;
  if (/^\d[\da-fx.]*$/i.test(rawHost) && rawHost.toLowerCase() !== url.hostname) {
    return true;
  }
  return false;
}

export function normalizeCogDocApiUrl(
  raw: string,
  options: CogDocApiUrlOptions,
): string {
  const value = raw.trim();
  if (!value) return "";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid COGDOC_API_URL: configure one http(s) origin");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
    || !url.hostname
    || url.hostname.endsWith(".")
    || hasAmbiguousCogDocAuthority(value, url)
  ) {
    throw new Error("Invalid COGDOC_API_URL: configure one http(s) origin");
  }

  if (
    url.protocol === "http:"
    && options.nodeEnv === "production"
    && !options.allowInsecureHttp
  ) {
    throw new Error(
      "COGDOC_API_URL must use HTTPS in production unless server HTTP opt-in is enabled",
    );
  }

  return url.origin;
}

export function isCogDocInsecureHttpAllowed(
  raw = getEnv().COGDOC_ALLOW_INSECURE_HTTP,
): boolean {
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "1";
}

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
    COGDOC_ALLOW_INSECURE_HTTP: process.env.COGDOC_ALLOW_INSECURE_HTTP ?? "",
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

  const data = {
    ...parsed.data,
    COGDOC_API_URL: normalizeCogDocApiUrl(parsed.data.COGDOC_API_URL, {
      nodeEnv: process.env.NODE_ENV,
      allowInsecureHttp: isCogDocInsecureHttpAllowed(
        parsed.data.COGDOC_ALLOW_INSECURE_HTTP,
      ),
    }),
  };

  const unsafeCredentials = productionCredentialIssues(data);
  if (unsafeCredentials.length > 0) {
    throw new Error(
      `Unsafe production credentials: replace ${unsafeCredentials.join(", ")} before starting the server`,
    );
  }

  cached = data;
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
