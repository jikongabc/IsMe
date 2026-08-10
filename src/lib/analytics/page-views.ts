import { createHash } from "node:crypto";
import { and, desc, gte, like, or, sql } from "drizzle-orm";
import { maybePruneAnalytics } from "@/lib/analytics/retention";
import {
  fillDailySeries,
  parseInsightsRange,
  rangeSinceIso,
  type InsightsRange,
} from "@/lib/analytics/range";
import { getHashSecret } from "@/lib/auth/hash-secret";
import { getDb } from "@/lib/db";
import { pageViews } from "@/lib/db/schema";
import { normalizePublicPath, normalizeReferrer } from "./normalize-path";

function id(): string {
  return `pv_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function now(): string {
  return new Date().toISOString();
}

function sinceFilter(since: string | null) {
  return since ? gte(pageViews.createdAt, since) : undefined;
}

export function hashVisitor(ip: string, userAgent: string): string {
  return createHash("sha256")
    .update(`${getHashSecret()}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 24);
}

export function recordPageView(input: {
  path: string;
  referrer?: string | null;
  locale?: string | null;
  visitorHash?: string | null;
  device?: string | null;
  country?: string | null;
}): string | null {
  const path = normalizePublicPath(input.path);
  if (!path) return null;

  const rowId = id();
  getDb()
    .insert(pageViews)
    .values({
      id: rowId,
      path,
      referrer: normalizeReferrer(input.referrer),
      locale: (input.locale ?? "").slice(0, 16),
      visitorHash: (input.visitorHash ?? "").slice(0, 64),
      device: (input.device ?? "").slice(0, 24),
      country: (input.country ?? "").slice(0, 8),
      createdAt: now(),
    })
    .run();
  return rowId;
}

export function tryRecordPageView(
  input: Parameters<typeof recordPageView>[0],
): void {
  try {
    recordPageView(input);
    maybePruneAnalytics();
  } catch {
    // analytics must never break browsing
  }
}

export function getPageViewStats(since: string | null = null) {
  const db = getDb();
  const where = sinceFilter(since);
  const totalQ = db.select({ count: sql<number>`count(*)`.as("count") }).from(pageViews);
  const uniqueQ = db
    .select({
      count: sql<number>`count(distinct ${pageViews.visitorHash})`.as("count"),
    })
    .from(pageViews);

  const total = Number((where ? totalQ.where(where) : totalQ).all()[0]?.count ?? 0);
  const unique = Number((where ? uniqueQ.where(where) : uniqueQ).all()[0]?.count ?? 0);
  return { totalViews: total, uniqueVisitors: unique };
}

export function listTopPaths(limit = 15, since: string | null = null) {
  const where = sinceFilter(since);
  const q = getDb()
    .select({
      path: pageViews.path,
      count: sql<number>`count(*)`.as("count"),
      lastSeenAt: sql<string>`max(${pageViews.createdAt})`.as("last_seen_at"),
    })
    .from(pageViews);
  return (where ? q.where(where) : q)
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${pageViews.createdAt})`))
    .limit(limit)
    .all()
    .map((row) => ({
      path: row.path,
      count: Number(row.count),
      lastSeenAt: row.lastSeenAt,
    }));
}

/** Blog + project detail paths for content performance. */
export function listTopContentPaths(limit = 12, since: string | null = null) {
  const parts = [
    like(pageViews.path, "/blog/%"),
    like(pageViews.path, "/projects/%"),
  ];
  const contentWhere = or(...parts)!;
  const where = since ? and(contentWhere, gte(pageViews.createdAt, since)) : contentWhere;

  return getDb()
    .select({
      path: pageViews.path,
      count: sql<number>`count(*)`.as("count"),
      lastSeenAt: sql<string>`max(${pageViews.createdAt})`.as("last_seen_at"),
    })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${pageViews.createdAt})`))
    .limit(limit)
    .all()
    .map((row) => ({
      path: row.path,
      count: Number(row.count),
      lastSeenAt: row.lastSeenAt,
    }));
}

export function listTopReferrers(limit = 10, since: string | null = null) {
  const where = sinceFilter(since);
  const q = getDb()
    .select({
      referrer: pageViews.referrer,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(pageViews);
  return (where ? q.where(where) : q)
    .groupBy(pageViews.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(limit)
    .all()
    .map((row) => ({
      referrer: row.referrer || "(direct)",
      count: Number(row.count),
    }))
    .filter((row) => row.referrer !== "(direct)" || row.count > 0);
}

export function listRecentPageViews(limit = 20, since: string | null = null) {
  const where = sinceFilter(since);
  const q = getDb().select().from(pageViews);
  return (where ? q.where(where) : q).orderBy(desc(pageViews.createdAt)).limit(limit).all();
}

export function listTopDevices(limit = 8, since: string | null = null) {
  const where = sinceFilter(since);
  const q = getDb()
    .select({
      device: pageViews.device,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(pageViews);
  return (where ? q.where(where) : q)
    .groupBy(pageViews.device)
    .orderBy(desc(sql`count(*)`))
    .limit(limit)
    .all()
    .map((row) => ({
      device: row.device || "unknown",
      count: Number(row.count),
    }));
}

export function listTopCountries(limit = 12, since: string | null = null) {
  const where = sinceFilter(since);
  const q = getDb()
    .select({
      country: pageViews.country,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(pageViews);
  return (where ? q.where(where) : q)
    .groupBy(pageViews.country)
    .orderBy(desc(sql`count(*)`))
    .limit(limit)
    .all()
    .map((row) => ({
      country: row.country || "(unknown)",
      count: Number(row.count),
    }));
}

export function listViewsByDay(since: string | null = null) {
  const where = sinceFilter(since);
  const q = getDb()
    .select({
      day: sql<string>`substr(${pageViews.createdAt}, 1, 10)`.as("day"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(pageViews);
  const rows = (where ? q.where(where) : q)
    .groupBy(sql`substr(${pageViews.createdAt}, 1, 10)`)
    .orderBy(sql`substr(${pageViews.createdAt}, 1, 10)`)
    .all()
    .map((row) => ({ day: row.day, count: Number(row.count) }));
  return fillDailySeries(rows, since);
}

export function getTrafficBundle(range: InsightsRange | string = "30d") {
  const parsed = parseInsightsRange(typeof range === "string" ? range : range);
  const since = rangeSinceIso(parsed);
  return {
    range: parsed,
    since,
    stats: getPageViewStats(since),
    topPaths: listTopPaths(15, since),
    topContent: listTopContentPaths(12, since),
    topReferrers: listTopReferrers(10, since),
    topDevices: listTopDevices(8, since),
    topCountries: listTopCountries(12, since),
    dailyViews: listViewsByDay(since),
    recent: listRecentPageViews(20, since),
  };
}
