import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  adminAuditLogs,
  answerFeedback,
  chatEvents,
  pageViews,
} from "@/lib/db/schema";

/** Keep raw analytics for ~90 days; audit a bit longer. */
export const ANALYTICS_RETENTION_DAYS = 90;
export const AUDIT_RETENTION_DAYS = 180;

let opsSincePrune = 0;
const PRUNE_EVERY_N_OPS = 64;

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function pruneExpiredAnalytics(now = Date.now()): {
  pageViews: number;
  chatEvents: number;
  answerFeedback: number;
  auditLogs: number;
} {
  const analyticsCutoff = new Date(
    now - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const auditCutoff = new Date(
    now - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const db = getDb();
  const pv = db.delete(pageViews).where(lt(pageViews.createdAt, analyticsCutoff)).run();
  const chat = db.delete(chatEvents).where(lt(chatEvents.createdAt, analyticsCutoff)).run();
  const fb = db
    .delete(answerFeedback)
    .where(lt(answerFeedback.createdAt, analyticsCutoff))
    .run();
  const audit = db
    .delete(adminAuditLogs)
    .where(lt(adminAuditLogs.createdAt, auditCutoff))
    .run();

  return {
    pageViews: pv.changes ?? 0,
    chatEvents: chat.changes ?? 0,
    answerFeedback: fb.changes ?? 0,
    auditLogs: audit.changes ?? 0,
  };
}

/** Opportunistic prune so long-running sites do not grow unbounded. */
export function maybePruneAnalytics(): void {
  opsSincePrune += 1;
  if (opsSincePrune < PRUNE_EVERY_N_OPS) return;
  opsSincePrune = 0;
  try {
    pruneExpiredAnalytics();
  } catch {
    // retention must never break request paths
  }
}

/** Exposed for tests. */
export function __resetPruneCounterForTests(): void {
  opsSincePrune = 0;
}

export function analyticsCutoffIso(): string {
  return cutoffIso(ANALYTICS_RETENTION_DAYS);
}
