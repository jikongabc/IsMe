import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { ensureSchema } from "./migrate";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

declare global {
  var __ismeDb: AppDatabase | undefined;
  var __ismeSqlite: Database.Database | undefined;
}

function resolveDbPath(): string {
  const raw = process.env.ISME_DATABASE_PATH ?? "./data/isme.db";
  if (path.isAbsolute(raw)) return raw;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), raw);
}

export function getDb(): AppDatabase {
  if (global.__ismeDb) return global.__ismeDb;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  global.__ismeSqlite = sqlite;
  global.__ismeDb = db;
  return db;
}

/** Native connection for operations that need SQLite transaction modes. */
export function getSqlite(): Database.Database {
  getDb();
  if (!global.__ismeSqlite) throw new Error("SQLite connection was not initialized");
  return global.__ismeSqlite;
}

/**
 * Apply additive schema migrations once during server startup. Keeping this out
 * of render-time queries avoids request side effects and build-worker races.
 */
export function initializeDatabase(): void {
  ensureSchema(getSqlite());
}
