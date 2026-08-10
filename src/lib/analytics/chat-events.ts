import { and, desc, eq, gte, sql } from "drizzle-orm";
import { maybePruneAnalytics } from "@/lib/analytics/retention";
import {
  fillDailySeries,
  parseInsightsRange,
  rangeSinceIso,
  type InsightsRange,
} from "@/lib/analytics/range";
import { getDb } from "@/lib/db";
import { answerFeedback, chatEvents } from "@/lib/db/schema";
import { normalizeQuery } from "./normalize-query";

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function recordChatEvent(input: {
  moduleSlug: string;
  query: string;
  sessionId?: string | null;
  traceId?: string | null;
  demo?: boolean;
}): string {
  const rowId = id("chat");
  getDb()
    .insert(chatEvents)
    .values({
      id: rowId,
      moduleSlug: input.moduleSlug,
      query: input.query.trim().slice(0, 2000),
      queryNormalized: normalizeQuery(input.query).slice(0, 2000),
      sessionId: input.sessionId ?? null,
      traceId: input.traceId ?? "",
      demo: Boolean(input.demo),
      createdAt: now(),
    })
    .run();
  return rowId;
}

export function recordAnswerFeedback(input: {
  moduleSlug: string;
  traceId: string;
  feedback: "thumbs_up" | "thumbs_down";
  comment?: string;
  demo?: boolean;
}): string {
  const rowId = id("fb");
  getDb()
    .insert(answerFeedback)
    .values({
      id: rowId,
      moduleSlug: input.moduleSlug,
      traceId: input.traceId,
      feedback: input.feedback,
      comment: (input.comment ?? "").slice(0, 2000),
      demo: Boolean(input.demo),
      createdAt: now(),
    })
    .run();
  return rowId;
}

export type HotQuestion = {
  query: string;
  queryNormalized: string;
  count: number;
  moduleSlug: string;
  lastAskedAt: string;
};

export function listHotQuestions(options?: {
  limit?: number;
  moduleSlug?: string;
  since?: string | null;
}): HotQuestion[] {
  const limit = options?.limit ?? 10;
  const db = getDb();
  const since = options?.since ?? null;

  if (options?.moduleSlug) {
    const where = since
      ? and(eq(chatEvents.moduleSlug, options.moduleSlug), gte(chatEvents.createdAt, since))
      : eq(chatEvents.moduleSlug, options.moduleSlug);
    return db
      .select({
        query: sql<string>`min(${chatEvents.query})`.as("query"),
        queryNormalized: chatEvents.queryNormalized,
        count: sql<number>`count(*)`.as("count"),
        moduleSlug: chatEvents.moduleSlug,
        lastAskedAt: sql<string>`max(${chatEvents.createdAt})`.as("last_asked_at"),
      })
      .from(chatEvents)
      .where(where)
      .groupBy(chatEvents.moduleSlug, chatEvents.queryNormalized)
      .orderBy(desc(sql`count(*)`), desc(sql`max(${chatEvents.createdAt})`))
      .limit(limit)
      .all();
  }

  const q = db
    .select({
      query: sql<string>`min(${chatEvents.query})`.as("query"),
      queryNormalized: chatEvents.queryNormalized,
      count: sql<number>`count(*)`.as("count"),
      moduleSlug: sql<string>`min(${chatEvents.moduleSlug})`.as("module_slug"),
      lastAskedAt: sql<string>`max(${chatEvents.createdAt})`.as("last_asked_at"),
    })
    .from(chatEvents);
  return (since ? q.where(gte(chatEvents.createdAt, since)) : q)
    .groupBy(chatEvents.queryNormalized)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${chatEvents.createdAt})`))
    .limit(limit)
    .all();
}

export function listRecentChatEvents(limit = 20, since: string | null = null) {
  const q = getDb().select().from(chatEvents);
  return (since ? q.where(gte(chatEvents.createdAt, since)) : q)
    .orderBy(desc(chatEvents.createdAt))
    .limit(limit)
    .all();
}

export function getFeedbackSummary(moduleSlug?: string, since: string | null = null) {
  const db = getDb();
  const filters = [];
  if (moduleSlug) filters.push(eq(answerFeedback.moduleSlug, moduleSlug));
  if (since) filters.push(gte(answerFeedback.createdAt, since));
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

  const q = db
    .select({
      feedback: answerFeedback.feedback,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(answerFeedback);
  const rows = (where ? q.where(where) : q).groupBy(answerFeedback.feedback).all();

  let thumbsUp = 0;
  let thumbsDown = 0;
  for (const row of rows) {
    if (row.feedback === "thumbs_up") thumbsUp = Number(row.count);
    if (row.feedback === "thumbs_down") thumbsDown = Number(row.count);
  }
  return { thumbsUp, thumbsDown, total: thumbsUp + thumbsDown };
}

export function getChatStats(since: string | null = null) {
  const db = getDb();
  const totalQ = db.select({ count: sql<number>`count(*)`.as("count") }).from(chatEvents);
  const totalRow = (since ? totalQ.where(gte(chatEvents.createdAt, since)) : totalQ).all()[0];

  const demoWhere = since
    ? and(eq(chatEvents.demo, true), gte(chatEvents.createdAt, since))
    : eq(chatEvents.demo, true);
  const demoRow = db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(chatEvents)
    .where(demoWhere)
    .all()[0];

  const byModuleQ = db
    .select({
      moduleSlug: chatEvents.moduleSlug,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(chatEvents);
  const byModule = (since ? byModuleQ.where(gte(chatEvents.createdAt, since)) : byModuleQ)
    .groupBy(chatEvents.moduleSlug)
    .orderBy(desc(sql`count(*)`))
    .all();

  return {
    totalQuestions: Number(totalRow?.count ?? 0),
    demoQuestions: Number(demoRow?.count ?? 0),
    byModule: byModule.map((row) => ({
      moduleSlug: row.moduleSlug,
      count: Number(row.count),
    })),
  };
}

export function listQuestionsByDay(since: string | null = null) {
  const q = getDb()
    .select({
      day: sql<string>`substr(${chatEvents.createdAt}, 1, 10)`.as("day"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(chatEvents);
  const rows = (since ? q.where(gte(chatEvents.createdAt, since)) : q)
    .groupBy(sql`substr(${chatEvents.createdAt}, 1, 10)`)
    .orderBy(sql`substr(${chatEvents.createdAt}, 1, 10)`)
    .all()
    .map((row) => ({ day: row.day, count: Number(row.count) }));
  return fillDailySeries(rows, since);
}

export function getInsightsBundle(range: InsightsRange | string = "30d") {
  const parsed = parseInsightsRange(typeof range === "string" ? range : range);
  const since = rangeSinceIso(parsed);
  return {
    range: parsed,
    since,
    stats: getChatStats(since),
    feedback: getFeedbackSummary(undefined, since),
    hotQuestions: listHotQuestions({ limit: 15, since }),
    dailyQuestions: listQuestionsByDay(since),
    recent: listRecentChatEvents(25, since),
  };
}

/** Safe wrapper — never throw into chat request path. */
export function tryRecordChatEvent(
  input: Parameters<typeof recordChatEvent>[0],
): void {
  try {
    recordChatEvent(input);
    maybePruneAnalytics();
  } catch {
    // analytics must not break answers
  }
}

export function tryRecordAnswerFeedback(
  input: Parameters<typeof recordAnswerFeedback>[0],
): void {
  try {
    recordAnswerFeedback(input);
    maybePruneAnalytics();
  } catch {
    // analytics must not break feedback UX
  }
}

export function listModuleHotQuestions(moduleSlug: string, limit = 5): string[] {
  return listHotQuestions({ moduleSlug, limit }).map((row) => row.query);
}
