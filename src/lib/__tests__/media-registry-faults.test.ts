import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMediaObject: vi.fn(),
  deleteMediaObject: vi.fn(),
}));

vi.mock("@/lib/media/storage", () => ({
  createMediaObject: mocks.createMediaObject,
  deleteMediaObject: mocks.deleteMediaObject,
  guessContentType: vi.fn(() => "image/png"),
  listLocalDiskFiles: vi.fn(async () => []),
  putMediaObject: vi.fn(),
  storageBackend: vi.fn(() => "local"),
}));

import { getDb, getSqlite } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import { mediaAssets } from "@/lib/db/schema";
import {
  MediaRegistryError,
  removeMedia,
  saveMedia,
} from "@/lib/media/registry";

const originalDatabasePath = process.env.ISME_DATABASE_PATH;
let tempDirectory = "";

function insertRow(key: string): void {
  getDb().insert(mediaAssets).values({
    id: `row-${key}`,
    key,
    url: `/uploads/${key}`,
    bytes: 5,
    contentType: "image/png",
    storage: "local",
    createdAt: "2026-08-30T00:00:00.000Z",
  }).run();
}

describe("media registry compensation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tempDirectory = mkdtempSync(join(tmpdir(), "isme-media-registry-"));
    process.env.ISME_DATABASE_PATH = join(tempDirectory, "isme.db");
    delete global.__ismeDb;
    delete global.__ismeSqlite;
    ensureSchema(getSqlite());
    mocks.createMediaObject.mockResolvedValue({
      key: "new.png",
      name: "new.png",
      url: "/uploads/new.png",
      bytes: 5,
      contentType: "image/png",
      storage: "local",
    });
  });

  afterEach(() => {
    global.__ismeSqlite?.close();
    delete global.__ismeDb;
    delete global.__ismeSqlite;
    if (originalDatabasePath === undefined) delete process.env.ISME_DATABASE_PATH;
    else process.env.ISME_DATABASE_PATH = originalDatabasePath;
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("compensates a newly created object when registry insertion fails", async () => {
    getSqlite().exec(`
      CREATE TRIGGER reject_media_insert
      BEFORE INSERT ON media_assets
      BEGIN SELECT RAISE(FAIL, 'injected insert failure'); END;
    `);
    mocks.deleteMediaObject.mockResolvedValue("deleted");

    await expect(saveMedia("new.png", Buffer.from("image"), "image/png"))
      .rejects.toMatchObject({ code: "MEDIA_REGISTRATION_FAILED" });
    expect(mocks.createMediaObject).toHaveBeenCalledOnce();
    expect(mocks.deleteMediaObject).toHaveBeenCalledWith("new.png", "local");
    expect(getDb().select().from(mediaAssets).all()).toEqual([]);
  });

  it("returns a sanitized reconcile-required error when compensation fails", async () => {
    getSqlite().exec(`
      CREATE TRIGGER reject_media_insert
      BEFORE INSERT ON media_assets
      BEGIN SELECT RAISE(FAIL, 'private database path'); END;
    `);
    mocks.createMediaObject.mockResolvedValueOnce({
      key: "media/new.png",
      name: "new.png",
      url: "https://cdn.example.test/media/new.png",
      bytes: 5,
      contentType: "image/png",
      storage: "s3",
    });
    mocks.deleteMediaObject.mockRejectedValue(
      new Error("s3://private-bucket endpoint=https://secret.example"),
    );

    const error = await saveMedia("new.png", Buffer.from("image"), "image/png")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MediaRegistryError);
    expect(error).toMatchObject({
      code: "MEDIA_RECONCILE_REQUIRED",
      key: "media/new.png",
      storage: "s3",
    });
    expect(mocks.deleteMediaObject).toHaveBeenCalledWith("media/new.png", "s3");
    expect(String(error)).not.toContain("private-bucket");
    expect(String(error)).not.toContain("secret.example");
  });

  it("keeps the registry on transient delete failure and removes it after retry", async () => {
    insertRow("delete.png");
    mocks.deleteMediaObject.mockRejectedValueOnce(new Error("temporary delete failure"));

    await expect(removeMedia("delete.png")).rejects.toThrow("temporary delete failure");
    expect(getDb().select().from(mediaAssets).all()).toHaveLength(1);

    mocks.deleteMediaObject.mockResolvedValueOnce("deleted");
    await expect(removeMedia("delete.png")).resolves.toBe(true);
    expect(getDb().select().from(mediaAssets).all()).toEqual([]);
  });

  it("removes a stale registry only after storage confirms absence", async () => {
    insertRow("missing.png");
    insertRow("other.png");
    mocks.deleteMediaObject.mockResolvedValue("not_found");

    await expect(removeMedia("missing.png")).resolves.toBe(true);
    expect(getDb().select().from(mediaAssets).all().map((row) => row.key)).toEqual([
      "other.png",
    ]);
    expect(mocks.deleteMediaObject).toHaveBeenCalledWith("missing.png", "local");
  });
});
