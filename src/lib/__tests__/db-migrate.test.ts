import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSchema } from "@/lib/db/migrate";

type ColumnSummary = {
  defaultValue: string | null;
  name: string;
  notNull: number;
  primaryKey: number;
  type: string;
};

type ForeignKeySummary = {
  from: string;
  match: string;
  onDelete: string;
  onUpdate: string;
  table: string;
  to: string;
};

type IndexSummary = {
  columns: string[];
  name: string;
  origin: string;
  unique: number;
};

type SchemaSummary = {
  objects: Array<{
    name: string;
    sql: string | null;
    table: string;
    type: string;
  }>;
  tables: Array<{
    columns: ColumnSummary[];
    foreignKeys: ForeignKeySummary[];
    indexes: IndexSummary[];
    name: string;
  }>;
};

let databases: Database.Database[] = [];
let tempDirectory = "";

function openDatabase(name: string): Database.Database {
  const sqlite = new Database(join(tempDirectory, name));
  sqlite.pragma("foreign_keys = ON");
  databases.push(sqlite);
  return sqlite;
}

function normalizeSql(sql: string | null): string | null {
  return sql?.replace(/\s+/g, " ").trim() ?? null;
}

function schemaSummary(sqlite: Database.Database): SchemaSummary {
  const objects = sqlite
    .prepare(
      `SELECT type, name, tbl_name AS "table", sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all() as SchemaSummary["objects"];
  const tableNames = objects
    .filter((object) => object.type === "table")
    .map((object) => object.name);

  return {
    objects: objects.map((object) => ({
      ...object,
      // ALTER TABLE appends columns, so logical table equality comes from the
      // sorted PRAGMA data below rather than physical declaration order.
      sql: object.type === "table" ? null : normalizeSql(object.sql),
    })),
    tables: tableNames.map((table) => {
      const columns = sqlite
        .prepare(
          `SELECT
             name,
             type,
             "notnull" AS "notNull",
             dflt_value AS "defaultValue",
             pk AS "primaryKey"
           FROM pragma_table_info(?)
           ORDER BY name`,
        )
        .all(table) as ColumnSummary[];
      const indexes = sqlite
        .prepare(
          `SELECT name, "unique", origin
           FROM pragma_index_list(?)
           ORDER BY name`,
        )
        .all(table) as Array<Omit<IndexSummary, "columns">>;
      const foreignKeys = sqlite
        .prepare(
          `SELECT
             "table",
             "from",
             "to",
             on_update AS onUpdate,
             on_delete AS onDelete,
             "match"
           FROM pragma_foreign_key_list(?)
           ORDER BY "table", "from", "to"`,
        )
        .all(table) as ForeignKeySummary[];

      return {
        name: table,
        columns,
        indexes: indexes.map((index) => ({
          ...index,
          columns: (
            sqlite
              .prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
              .all(index.name) as Array<{ name: string }>
          ).map((column) => column.name),
        })),
        foreignKeys,
      };
    }),
  };
}

function table(summary: SchemaSummary, name: string) {
  const found = summary.tables.find((candidate) => candidate.name === name);
  expect(found, `missing table ${name}`).toBeDefined();
  return found!;
}

function column(summary: SchemaSummary, tableName: string, columnName: string) {
  const found = table(summary, tableName).columns.find(
    (candidate) => candidate.name === columnName,
  );
  expect(found, `missing column ${tableName}.${columnName}`).toBeDefined();
  return found!;
}

function createLegacyFixture(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE site_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      site_name TEXT NOT NULL DEFAULT 'IsMe',
      display_name TEXT NOT NULL DEFAULT '',
      english_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '',
      introduction TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      public_email TEXT NOT NULL DEFAULT '',
      availability TEXT NOT NULL DEFAULT '',
      admin_password_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE experiences (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      organization TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE focus_areas (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      repository_url TEXT NOT NULL DEFAULT '',
      demo_url TEXT NOT NULL DEFAULT '',
      tech_stack TEXT NOT NULL DEFAULT '[]',
      featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
    );

    CREATE TABLE blog_posts (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      content_markdown TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE contact_messages (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE knowledge_base_modules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      cogdoc_kb_id TEXT NOT NULL DEFAULT '',
      welcome_message TEXT NOT NULL DEFAULT '',
      suggested_questions TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE page_views (
      id TEXT PRIMARY KEY NOT NULL,
      path TEXT NOT NULL,
      referrer TEXT NOT NULL DEFAULT '',
      locale TEXT NOT NULL DEFAULT '',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE guestbook_messages (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE media_assets (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      bytes INTEGER NOT NULL DEFAULT 0,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      storage TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL
    );

    INSERT INTO site_profiles (
      id, display_name, admin_password_hash, created_at, updated_at
    ) VALUES (
      'profile-legacy', 'Legacy profile', 'preserved-password-hash',
      '2026-01-01', '2026-01-02'
    );
    INSERT INTO projects (id, name, slug)
    VALUES ('project-legacy', 'Legacy project', 'legacy-project');
    INSERT INTO blog_posts (
      id, title, slug, content_markdown, created_at, updated_at
    ) VALUES (
      'post-legacy', 'Legacy post', 'legacy-post', 'Preserved body',
      '2026-01-03', '2026-01-04'
    );
    INSERT INTO contact_messages (id, name, body, ip_hash, created_at)
    VALUES ('contact-legacy', 'Contact', 'Preserved contact', 'contact-hash', '2026-01-05');
    INSERT INTO guestbook_messages (id, name, body, ip_hash, created_at)
    VALUES ('guestbook-legacy', 'Guest', 'Preserved guestbook', 'guest-hash', '2026-01-06');
    INSERT INTO media_assets (id, key, url, bytes, content_type, storage, created_at)
    VALUES (
      'media-legacy', 'legacy.png', '/uploads/legacy.png', 42,
      'image/png', 'local', '2026-01-07'
    );
  `);
}

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "isme-db-migrate-"));
});

afterEach(() => {
  for (const sqlite of databases) {
    if (sqlite.open) sqlite.close();
  }
  databases = [];
  rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = "";
});

describe("database migration", () => {
  it("converges empty, legacy, and current databases without schema drift", () => {
    const empty = openDatabase("empty.db");
    ensureSchema(empty);
    const emptyOnce = schemaSummary(empty);
    ensureSchema(empty);
    expect(schemaSummary(empty)).toEqual(emptyOnce);

    const legacy = openDatabase("legacy.db");
    createLegacyFixture(legacy);
    ensureSchema(legacy);
    const legacyOnce = schemaSummary(legacy);
    const legacyRows = {
      profile: legacy
        .prepare(
          `SELECT id, display_name, admin_password_hash, admin_session_version
           FROM site_profiles`,
        )
        .get(),
      project: legacy
        .prepare("SELECT id, name, slug, metrics, decisions, gallery FROM projects")
        .get(),
      post: legacy
        .prepare("SELECT id, title, slug, content_markdown FROM blog_posts")
        .get(),
      contact: legacy
        .prepare("SELECT id, name, body, ip_hash FROM contact_messages")
        .get(),
      guestbook: legacy
        .prepare("SELECT id, name, body, ip_hash FROM guestbook_messages")
        .get(),
      media: legacy
        .prepare("SELECT id, key, url, bytes, content_type, storage FROM media_assets")
        .get(),
    };
    ensureSchema(legacy);
    expect(schemaSummary(legacy)).toEqual(legacyOnce);
    expect({
      profile: legacy
        .prepare(
          `SELECT id, display_name, admin_password_hash, admin_session_version
           FROM site_profiles`,
        )
        .get(),
      project: legacy
        .prepare("SELECT id, name, slug, metrics, decisions, gallery FROM projects")
        .get(),
      post: legacy
        .prepare("SELECT id, title, slug, content_markdown FROM blog_posts")
        .get(),
      contact: legacy
        .prepare("SELECT id, name, body, ip_hash FROM contact_messages")
        .get(),
      guestbook: legacy
        .prepare("SELECT id, name, body, ip_hash FROM guestbook_messages")
        .get(),
      media: legacy
        .prepare("SELECT id, key, url, bytes, content_type, storage FROM media_assets")
        .get(),
    }).toEqual(legacyRows);

    expect(legacyRows).toMatchObject({
      profile: {
        id: "profile-legacy",
        display_name: "Legacy profile",
        admin_password_hash: "preserved-password-hash",
      },
      project: {
        id: "project-legacy",
        metrics: "[]",
        decisions: "[]",
        gallery: "[]",
      },
      post: { id: "post-legacy", content_markdown: "Preserved body" },
      contact: { id: "contact-legacy", body: "Preserved contact" },
      guestbook: { id: "guestbook-legacy", body: "Preserved guestbook" },
      media: { id: "media-legacy", key: "legacy.png", bytes: 42 },
    });
    expect(
      (legacyRows.profile as { admin_session_version: number }).admin_session_version,
    ).toBeGreaterThan(0);

    const current = openDatabase("current.db");
    ensureSchema(current);
    const currentOnce = schemaSummary(current);
    ensureSchema(current);
    ensureSchema(current);
    expect(schemaSummary(current)).toEqual(currentOnce);

    expect(legacyOnce).toEqual(emptyOnce);
    expect(currentOnce).toEqual(emptyOnce);

    expect(column(emptyOnce, "site_profiles", "admin_session_version")).toMatchObject({
      type: "INTEGER",
      notNull: 1,
      defaultValue: "0",
    });
    expect(column(emptyOnce, "projects", "content_format").defaultValue).toBe(
      "'markdown'",
    );
    expect(column(emptyOnce, "contact_messages", "status").defaultValue).toBe(
      "'unread'",
    );
    expect(column(emptyOnce, "guestbook_messages", "status").defaultValue).toBe(
      "'pending'",
    );
    expect(column(emptyOnce, "media_assets", "content_type").defaultValue).toBe(
      "'application/octet-stream'",
    );
    expect(
      table(emptyOnce, "contact_messages").indexes.map((index) => index.name),
    ).toContain("idx_contact_status_created");
    expect(
      table(emptyOnce, "guestbook_messages").indexes.map((index) => index.name),
    ).toContain("idx_guestbook_status_created");
    expect(table(emptyOnce, "media_assets").indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "idx_media_assets_created" }),
        expect.objectContaining({ columns: ["key"], unique: 1 }),
      ]),
    );
    for (const tableName of [
      "site_profiles",
      "blog_posts",
      "contact_messages",
      "guestbook_messages",
      "media_assets",
    ]) {
      expect(table(emptyOnce, tableName).foreignKeys).toEqual([]);
    }
    expect(legacy.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("rejects an unknown destructive table shape without rebuilding it", () => {
    const sqlite = openDatabase("unsupported.db");
    sqlite.exec(`
      CREATE TABLE site_profiles (
        id INTEGER PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO site_profiles (id, created_at, updated_at)
      VALUES (7, '2026-01-01', '2026-01-02');
    `);

    expect(() => ensureSchema(sqlite)).toThrowError(
      /Unsupported legacy schema.*site_profiles.*incompatible column definitions: id/i,
    );
    expect(
      sqlite.prepare("SELECT id, created_at, updated_at FROM site_profiles").all(),
    ).toEqual([
      {
        id: 7,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ]);
    expect(
      sqlite
        .prepare(
          "SELECT name FROM pragma_table_info('site_profiles') ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "created_at" },
      { name: "id" },
      { name: "updated_at" },
    ]);
  });
});
