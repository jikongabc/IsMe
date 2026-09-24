import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDatabase } from "@/lib/db";
import { guestbookMessages, type GuestbookMessage } from "@/lib/db/schema";
import { listAdminGuestbook } from "@/lib/guestbook/store";

const originalDatabasePath = process.env.ISME_DATABASE_PATH;
let tempDirectory = "";

function message(
  id: string,
  status: GuestbookMessage["status"],
  createdAt: string,
): GuestbookMessage {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    body: id,
    status,
    ipHash: "test-ip-hash",
    createdAt,
  };
}

function closeDatabase(): void {
  global.__ismeSqlite?.close();
  global.__ismeSqlite = undefined;
  global.__ismeDb = undefined;
}

beforeEach(() => {
  closeDatabase();
  tempDirectory = mkdtempSync(join(tmpdir(), "isme-guestbook-ordering-"));
  process.env.ISME_DATABASE_PATH = join(tempDirectory, "isme.db");
  initializeDatabase();
});

afterEach(() => {
  closeDatabase();
  if (originalDatabasePath === undefined) delete process.env.ISME_DATABASE_PATH;
  else process.env.ISME_DATABASE_PATH = originalDatabasePath;
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = "";
});

describe("listAdminGuestbook", () => {
  it("prioritizes an older pending message before applying the 200 row limit", () => {
    const approved = Array.from({ length: 200 }, (_, index) =>
      message(
        `approved-${index.toString().padStart(3, "0")}`,
        "approved",
        new Date(Date.UTC(2026, 0, 2, 0, 0, index)).toISOString(),
      ),
    );
    getDb()
      .insert(guestbookMessages)
      .values([
        message("pending-old", "pending", "2026-01-01T00:00:00.000Z"),
        ...approved,
      ])
      .run();

    const rows = listAdminGuestbook(200);

    expect(rows).toHaveLength(200);
    expect(rows[0]?.id).toBe("pending-old");
    expect(rows.map((row) => row.id)).not.toContain("approved-000");
  });

  it("orders statuses by review priority and keeps newest messages first within each status", () => {
    getDb()
      .insert(guestbookMessages)
      .values([
        message("rejected-old", "rejected", "2026-01-01T00:00:00.000Z"),
        message("approved-new", "approved", "2026-01-06T00:00:00.000Z"),
        message("pending-old", "pending", "2026-01-02T00:00:00.000Z"),
        message("rejected-new", "rejected", "2026-01-05T00:00:00.000Z"),
        message("pending-new", "pending", "2026-01-04T00:00:00.000Z"),
        message("approved-old", "approved", "2026-01-03T00:00:00.000Z"),
      ])
      .run();

    expect(listAdminGuestbook().map((row) => row.id)).toEqual([
      "pending-new",
      "pending-old",
      "approved-new",
      "approved-old",
      "rejected-new",
      "rejected-old",
    ]);
  });
});
