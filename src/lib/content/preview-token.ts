import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export type PreviewKind = "post" | "project";

type PreviewPayload = {
  kind: PreviewKind;
  slug: string;
  exp: number;
};

function sign(body: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(body).digest("base64url");
}

export function createPreviewToken(
  kind: PreviewKind,
  slug: string,
  ttlMs = 24 * 60 * 60 * 1000,
): string {
  const payload: PreviewPayload = {
    kind,
    slug,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPreviewToken(
  token: string,
  expected?: { kind?: PreviewKind; slug?: string },
): PreviewPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expectedSig = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as PreviewPayload;
    if (payload.kind !== "post" && payload.kind !== "project") return null;
    if (typeof payload.slug !== "string" || !payload.slug) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (expected?.kind && payload.kind !== expected.kind) return null;
    if (expected?.slug && payload.slug !== expected.slug) return null;
    return payload;
  } catch {
    return null;
  }
}

export function previewPath(kind: PreviewKind, slug: string, token: string): string {
  const base = kind === "post" ? "/blog/preview" : "/projects/preview";
  return `${base}/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`;
}
