import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureSchema } from "@/lib/db/migrate";

function legacyDatabase(): Database.Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE site_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      admin_password_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO site_profiles (id, created_at, updated_at)
    VALUES ('legacy-profile', '2026-01-01', '2026-01-01');
  `);
  return sqlite;
}

describe("admin session version migration", () => {
  it("assigns an unpredictable positive version to old databases and is idempotent", () => {
    const first = legacyDatabase();
    const second = legacyDatabase();
    try {
      ensureSchema(first);
      ensureSchema(second);
      const firstVersion = first
        .prepare("SELECT admin_session_version AS version FROM site_profiles")
        .get() as { version: number };
      const secondVersion = second
        .prepare("SELECT admin_session_version AS version FROM site_profiles")
        .get() as { version: number };

      expect(firstVersion.version).toBeGreaterThan(1);
      expect(secondVersion.version).toBeGreaterThan(1);
      expect(secondVersion.version).not.toBe(firstVersion.version);

      ensureSchema(first);
      const rerun = first
        .prepare("SELECT admin_session_version AS version FROM site_profiles")
        .get() as { version: number };
      expect(rerun.version).toBe(firstVersion.version);
    } finally {
      first.close();
      second.close();
    }
  });
});
