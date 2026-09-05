import Database from "better-sqlite3";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DDL = `
CREATE TABLE IF NOT EXISTS site_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  site_name TEXT NOT NULL DEFAULT 'IsMe',
  display_name TEXT NOT NULL DEFAULT '',
  english_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  role_en TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  headline_en TEXT NOT NULL DEFAULT '',
  introduction TEXT NOT NULL DEFAULT '',
  introduction_en TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  public_email TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  availability_en TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'terminal',
  default_locale TEXT NOT NULL DEFAULT 'zh',
  theme_config TEXT NOT NULL DEFAULT '{}',
  admin_password_hash TEXT NOT NULL DEFAULT '',
  admin_session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_links (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS focus_areas (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  organization TEXT NOT NULL,
  organization_en TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  role_en TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  summary_en TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  content_format TEXT NOT NULL DEFAULT 'markdown',
  cover_url TEXT NOT NULL DEFAULT '',
  repository_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL DEFAULT '[]',
  role TEXT NOT NULL DEFAULT '',
  role_en TEXT NOT NULL DEFAULT '',
  team_size INTEGER NOT NULL DEFAULT 0,
  duration TEXT NOT NULL DEFAULT '',
  duration_en TEXT NOT NULL DEFAULT '',
  metrics TEXT NOT NULL DEFAULT '[]',
  decisions TEXT NOT NULL DEFAULT '[]',
  gallery TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL DEFAULT '',
  excerpt_en TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  content_en TEXT NOT NULL DEFAULT '',
  content_format TEXT NOT NULL DEFAULT 'markdown',
  cover_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_base_modules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  cogdoc_kb_id TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT '',
  welcome_message_en TEXT NOT NULL DEFAULT '',
  suggested_questions TEXT NOT NULL DEFAULT '[]',
  suggested_questions_en TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_content_sync_at TEXT NOT NULL DEFAULT '',
  last_content_sync_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_events (
  id TEXT PRIMARY KEY NOT NULL,
  module_slug TEXT NOT NULL,
  query TEXT NOT NULL,
  query_normalized TEXT NOT NULL,
  session_id TEXT,
  trace_id TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answer_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  module_slug TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  feedback TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_events_module_created
  ON chat_events(module_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_events_query_norm
  ON chat_events(query_normalized);
CREATE INDEX IF NOT EXISTS idx_answer_feedback_module_created
  ON answer_feedback(module_slug, created_at);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT 'unknown',
  ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_logs(created_at);

CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT '',
  visitor_hash TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_page_views_path_created
  ON page_views(path, created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_created
  ON page_views(created_at);

CREATE TABLE IF NOT EXISTS guestbook_messages (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guestbook_status_created
  ON guestbook_messages(status, created_at);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created
  ON media_assets(created_at);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY NOT NULL,
  tokens REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const ADDITIVE_MIGRATIONS = [
  ["site_profiles", "site_name", "TEXT NOT NULL DEFAULT 'IsMe'"],
  ["site_profiles", "display_name", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "english_name", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "role", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "headline", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "introduction", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "avatar_url", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "location", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "public_email", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "availability", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "theme", "TEXT NOT NULL DEFAULT 'terminal'"],
  ["site_profiles", "default_locale", "TEXT NOT NULL DEFAULT 'zh'"],
  ["site_profiles", "theme_config", "TEXT NOT NULL DEFAULT '{}'"],
  ["site_profiles", "role_en", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "headline_en", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "introduction_en", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "availability_en", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "admin_password_hash", "TEXT NOT NULL DEFAULT ''"],
  ["site_profiles", "admin_session_version", "INTEGER NOT NULL DEFAULT 0"],
  ["experiences", "organization_en", "TEXT NOT NULL DEFAULT ''"],
  ["experiences", "role_en", "TEXT NOT NULL DEFAULT ''"],
  ["experiences", "description_en", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "name_en", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "summary_en", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "description_en", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "content_format", "TEXT NOT NULL DEFAULT 'markdown'"],
  ["projects", "role", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "role_en", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "team_size", "INTEGER NOT NULL DEFAULT 0"],
  ["projects", "duration", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "duration_en", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "metrics", "TEXT NOT NULL DEFAULT '[]'"],
  ["projects", "decisions", "TEXT NOT NULL DEFAULT '[]'"],
  ["projects", "gallery", "TEXT NOT NULL DEFAULT '[]'"],
  ["blog_posts", "tags", "TEXT NOT NULL DEFAULT '[]'"],
  ["blog_posts", "title_en", "TEXT NOT NULL DEFAULT ''"],
  ["blog_posts", "excerpt_en", "TEXT NOT NULL DEFAULT ''"],
  ["blog_posts", "content_en", "TEXT NOT NULL DEFAULT ''"],
  ["blog_posts", "content_format", "TEXT NOT NULL DEFAULT 'markdown'"],
  ["focus_areas", "title_en", "TEXT NOT NULL DEFAULT ''"],
  ["focus_areas", "description_en", "TEXT NOT NULL DEFAULT ''"],
  ["knowledge_base_modules", "name_en", "TEXT NOT NULL DEFAULT ''"],
  ["knowledge_base_modules", "description_en", "TEXT NOT NULL DEFAULT ''"],
  ["knowledge_base_modules", "welcome_message_en", "TEXT NOT NULL DEFAULT ''"],
  ["knowledge_base_modules", "suggested_questions_en", "TEXT NOT NULL DEFAULT '[]'"],
  ["knowledge_base_modules", "last_content_sync_at", "TEXT NOT NULL DEFAULT ''"],
  ["knowledge_base_modules", "last_content_sync_summary", "TEXT NOT NULL DEFAULT ''"],
  ["page_views", "device", "TEXT NOT NULL DEFAULT ''"],
  ["page_views", "country", "TEXT NOT NULL DEFAULT ''"],
] as const;

type SchemaColumn = {
  defaultValue: string | null;
  name: string;
  notNull: number;
  primaryKey: number;
  type: string;
};

function tableColumns(sqlite: Database.Database, table: string): SchemaColumn[] {
  return sqlite
    .prepare(
      `SELECT
         name,
         type,
         "notnull" AS "notNull",
         dflt_value AS "defaultValue",
         pk AS "primaryKey"
       FROM pragma_table_info(?)`,
    )
    .all(table) as SchemaColumn[];
}

function assertSupportedLegacySchema(sqlite: Database.Database): void {
  const existingTables = new Set(
    (
      sqlite
        .prepare(
          `SELECT name
           FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        )
        .all() as Array<{ name: string }>
    ).map((table) => table.name),
  );
  if (existingTables.size === 0) return;

  const reference = new Database(":memory:");
  try {
    reference.exec(DDL);
    const expectedTables = reference
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    for (const { name: table } of expectedTables) {
      if (!existingTables.has(table)) continue;

      const actualByName = new Map(
        tableColumns(sqlite, table).map((column) => [column.name, column]),
      );
      const additiveColumns = new Set<string>(
        ADDITIVE_MIGRATIONS.filter(([candidate]) => candidate === table).map(
          ([, column]) => column,
        ),
      );
      const missing: string[] = [];
      const incompatible: string[] = [];

      for (const expected of tableColumns(reference, table)) {
        const actual = actualByName.get(expected.name);
        if (!actual) {
          if (!additiveColumns.has(expected.name)) missing.push(expected.name);
          continue;
        }
        if (
          !additiveColumns.has(expected.name) &&
          (actual.type.toUpperCase() !== expected.type.toUpperCase() ||
            actual.notNull !== expected.notNull ||
            actual.defaultValue !== expected.defaultValue ||
            actual.primaryKey !== expected.primaryKey)
        ) {
          incompatible.push(expected.name);
        }
      }

      if (missing.length > 0 || incompatible.length > 0) {
        const reasons = [
          missing.length > 0 ? `missing required columns: ${missing.join(", ")}` : "",
          incompatible.length > 0
            ? `incompatible column definitions: ${incompatible.join(", ")}`
            : "",
        ].filter(Boolean);
        throw new Error(
          `Unsupported legacy schema for table "${table}": ${reasons.join("; ")}`,
        );
      }
    }
  } finally {
    reference.close();
  }
}

function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((col) => col.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function ensureSchema(sqlite: Database.Database): void {
  assertSupportedLegacySchema(sqlite);
  const migrate = sqlite.transaction(() => {
    sqlite.exec(DDL);
    for (const [table, column, definition] of ADDITIVE_MIGRATIONS) {
      ensureColumn(sqlite, table, column, definition);
    }
    // A cryptographically random positive starting point rejects all
    // pre-version cookies without giving every upgraded installation the same
    // credential generation. The WHERE clause keeps reruns idempotent.
    const profilesWithoutSessionVersion = sqlite
      .prepare("SELECT id FROM site_profiles WHERE admin_session_version <= 0")
      .all() as Array<{ id: string }>;
    const setInitialSessionVersion = sqlite.prepare(
      `UPDATE site_profiles
       SET admin_session_version = ?
       WHERE id = ? AND admin_session_version <= 0`,
    );
    for (const profile of profilesWithoutSessionVersion) {
      setInitialSessionVersion.run(
        randomInt(1_000_000_000, 2_000_000_000),
        profile.id,
      );
    }
    sqlite.exec(`
      UPDATE projects
      SET
        metrics = CASE
          WHEN metrics IS NULL OR json_valid(metrics) = 0 THEN '[]'
          WHEN json_type(metrics) <> 'array' THEN '[]'
          ELSE metrics
        END,
        decisions = CASE
          WHEN decisions IS NULL OR json_valid(decisions) = 0 THEN '[]'
          WHEN json_type(decisions) <> 'array' THEN '[]'
          ELSE decisions
        END,
        gallery = CASE
          WHEN gallery IS NULL OR json_valid(gallery) = 0 THEN '[]'
          WHEN json_type(gallery) <> 'array' THEN '[]'
          ELSE gallery
        END;

      CREATE INDEX IF NOT EXISTS idx_contact_status_created
        ON contact_messages(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_page_views_created
        ON page_views(created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_events_created
        ON chat_events(created_at);
    `);
  });
  migrate.immediate();
}

function resolveDbPath(): string {
  const raw = process.env.ISME_DATABASE_PATH ?? "./data/isme.db";
  if (path.isAbsolute(raw)) return raw;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), raw);
}

function main() {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  ensureSchema(sqlite);
  sqlite.close();
  console.log(`Database ready at ${dbPath}`);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"));

if (isDirectRun) {
  main();
}
