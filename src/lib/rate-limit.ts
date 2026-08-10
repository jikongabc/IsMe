import { getDb } from "@/lib/db";

type Bucket = {
  tokens: number;
  updatedAt: number;
};

/** In-process fallback when SQLite is unavailable (e.g. early boot / tests). */
const memoryBuckets = new Map<string, Bucket>();

let schemaReady = false;

function ensureRateLimitTable(): void {
  if (schemaReady) return;
  getDb();
  const sqlite = global.__ismeSqlite;
  if (!sqlite) throw new Error("sqlite not initialized");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY NOT NULL,
      tokens REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  schemaReady = true;
}

function takeFromBucket(
  current: Bucket,
  now: number,
  limit: number,
  windowMs: number,
): { ok: boolean; next: Bucket } {
  const elapsed = now - current.updatedAt;
  const refill = Math.floor(elapsed / windowMs) * limit;
  const tokens = Math.min(limit, current.tokens + (refill > 0 ? refill : 0));
  const updatedAt = refill > 0 ? now : current.updatedAt;

  if (tokens <= 0) {
    return { ok: false, next: { tokens: 0, updatedAt } };
  }
  return { ok: true, next: { tokens: tokens - 1, updatedAt } };
}

function takeTokenMemory(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const current = memoryBuckets.get(key) ?? { tokens: limit, updatedAt: now };
  const { ok, next } = takeFromBucket(current, now, limit, windowMs);
  memoryBuckets.set(key, next);
  return ok;
}

function takeTokenSqlite(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  ensureRateLimitTable();
  const sqlite = global.__ismeSqlite!;
  const now = Date.now();

  const row = sqlite
    .prepare("SELECT tokens, updated_at AS updatedAt FROM rate_limit_buckets WHERE key = ?")
    .get(key) as { tokens: number; updatedAt: number } | undefined;

  const current = row
    ? { tokens: row.tokens, updatedAt: row.updatedAt }
    : { tokens: limit, updatedAt: now };

  const { ok, next } = takeFromBucket(current, now, limit, windowMs);

  sqlite
    .prepare(
      `INSERT INTO rate_limit_buckets (key, tokens, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET tokens = excluded.tokens, updated_at = excluded.updated_at`,
    )
    .run(key, next.tokens, next.updatedAt);

  // Opportunistic cleanup of stale buckets
  if (Math.random() < 0.01) {
    const staleBefore = now - windowMs * 48;
    sqlite.prepare("DELETE FROM rate_limit_buckets WHERE updated_at < ?").run(staleBefore);
  }

  return ok;
}

export function takeToken(
  key: string,
  { limit = 20, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): boolean {
  try {
    return takeTokenSqlite(key, limit, windowMs);
  } catch {
    return takeTokenMemory(key, limit, windowMs);
  }
}

/** Test helper — clear memory fallback only. */
export function __resetMemoryRateLimitForTests(): void {
  memoryBuckets.clear();
  schemaReady = false;
}
