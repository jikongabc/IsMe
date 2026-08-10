import { desc } from "drizzle-orm";
import { clientIpFromHeaders } from "@/lib/auth/ip-allowlist";
import { getDb } from "@/lib/db";
import { adminAuditLogs } from "@/lib/db/schema";

function id(): string {
  return `audit_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function now(): string {
  return new Date().toISOString();
}

export type AuditInput = {
  action: string;
  target?: string;
  detail?: Record<string, unknown> | string;
  ip?: string;
  ok?: boolean;
};

export function recordAudit(input: AuditInput): void {
  const detail =
    typeof input.detail === "string"
      ? input.detail
      : input.detail
        ? JSON.stringify(input.detail)
        : "";

  getDb()
    .insert(adminAuditLogs)
    .values({
      id: id(),
      action: input.action.slice(0, 120),
      target: (input.target ?? "").slice(0, 200),
      detail: detail.slice(0, 4000),
      ip: (input.ip ?? "unknown").slice(0, 120),
      ok: input.ok !== false,
      createdAt: now(),
    })
    .run();
}

export function tryRecordAudit(input: AuditInput): void {
  try {
    recordAudit(input);
  } catch {
    // audit must never break the admin path
  }
}

export function tryAuditRequest(
  request: Request,
  input: Omit<AuditInput, "ip">,
): void {
  tryAuditRequestHeaders(request.headers, input);
}

export function tryAuditRequestHeaders(
  headers: Headers,
  input: Omit<AuditInput, "ip">,
): void {
  tryRecordAudit({
    ...input,
    ip: clientIpFromHeaders(headers),
  });
}

export function listAuditLogs(limit = 80) {
  return getDb()
    .select()
    .from(adminAuditLogs)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit)
    .all();
}
