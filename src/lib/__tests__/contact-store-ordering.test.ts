import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ContactStatus = "unread" | "read" | "archived";

let originalDatabasePath: string | undefined;
let tempDirectory = "";

function createContactDatabase(path: string): Database.Database {
  const sqlite = new Database(path);
  sqlite.exec(`
    CREATE TABLE contact_messages (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  return sqlite;
}

function insertContact(
  sqlite: Database.Database,
  id: string,
  status: ContactStatus,
  createdAt: string,
): void {
  sqlite
    .prepare(
      `INSERT INTO contact_messages
        (id, name, email, subject, body, status, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id, `${id}@example.com`, id, id, status, "ip-hash", createdAt);
}

beforeEach(() => {
  originalDatabasePath = process.env.ISME_DATABASE_PATH;
  tempDirectory = mkdtempSync(join(tmpdir(), "isme-contact-ordering-"));
  process.env.ISME_DATABASE_PATH = join(tempDirectory, "contacts.db");
  vi.resetModules();
});

afterEach(() => {
  if (originalDatabasePath === undefined) {
    delete process.env.ISME_DATABASE_PATH;
  } else {
    process.env.ISME_DATABASE_PATH = originalDatabasePath;
  }
  rmSync(tempDirectory, { force: true, recursive: true });
});

describe("contact store admin ordering", () => {
  it("prioritizes unread contacts before applying the 200-row limit", async () => {
    const sqlite = createContactDatabase(process.env.ISME_DATABASE_PATH!);
    insertContact(sqlite, "archived-new", "archived", "2026-01-06T00:00:00.000Z");
    insertContact(sqlite, "unread-old", "unread", "2026-01-01T00:00:00.000Z");
    insertContact(sqlite, "read-old", "read", "2026-01-02T00:00:00.000Z");
    insertContact(sqlite, "archived-old", "archived", "2026-01-03T00:00:00.000Z");
    insertContact(sqlite, "unread-new", "unread", "2026-01-05T00:00:00.000Z");
    insertContact(sqlite, "read-new", "read", "2026-01-04T00:00:00.000Z");

    const { countUnreadContacts, listAdminContacts } = await import(
      "@/lib/contact/store"
    );

    expect(listAdminContacts().map(({ id }) => id)).toEqual([
      "unread-new",
      "unread-old",
      "read-new",
      "read-old",
      "archived-new",
      "archived-old",
    ]);

    sqlite.prepare("DELETE FROM contact_messages").run();
    insertContact(sqlite, "older-unread", "unread", "2000-01-01T00:00:00.000Z");

    for (let index = 0; index < 200; index += 1) {
      const status: ContactStatus = index % 2 === 0 ? "read" : "archived";
      insertContact(
        sqlite,
        `newer-${index}`,
        status,
        new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      );
    }

    const contacts = listAdminContacts();

    expect(contacts).toHaveLength(200);
    expect(contacts[0]?.id).toBe("older-unread");
    expect(contacts.some(({ id }) => id === "older-unread")).toBe(true);
    expect(countUnreadContacts()).toBe(1);
    sqlite.close();
  });
});
