import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import {
  displayNameFromKey,
  resolveUploadName,
} from "@/lib/media/keys";
import {
  deleteMediaObject,
  guessContentType,
  listLocalDiskFiles,
  putMediaObject,
  storageBackend,
  type StorageBackend,
  type StoredObject,
} from "@/lib/media/storage";

export type MediaItem = {
  name: string;
  url: string;
  bytes: number;
  modifiedAt: string;
  storage: StorageBackend;
  contentType: string;
};

export type RegisteredMediaObject = {
  key: string;
  url: string;
  bytes: number;
  contentType: string;
  storage: StorageBackend;
};

async function backfillLocalDisk(): Promise<void> {
  if (storageBackend() !== "local") return;

  const db = getDb();
  const existing = new Set(
    db
      .select({ key: mediaAssets.key })
      .from(mediaAssets)
      .all()
      .map((row) => row.key),
  );

  const files = await listLocalDiskFiles();
  for (const file of files) {
    if (existing.has(file.name)) continue;
    db.insert(mediaAssets)
      .values({
        id: nanoid(),
        key: file.name,
        url: `/uploads/${file.name}`,
        bytes: file.bytes,
        contentType: guessContentType(file.name),
        storage: "local",
        createdAt: file.modifiedAt,
      })
      .run();
  }
}

export async function listMedia(): Promise<MediaItem[]> {
  await backfillLocalDisk();
  const rows = getDb()
    .select()
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt))
    .all();

  return rows.map((row) => ({
    name: displayNameFromKey(row.key),
    url: row.url,
    bytes: row.bytes,
    modifiedAt: row.createdAt,
    storage: (row.storage === "s3" ? "s3" : "local") as StorageBackend,
    contentType: row.contentType,
  }));
}

export async function listRegisteredMediaObjects(): Promise<RegisteredMediaObject[]> {
  await backfillLocalDisk();
  return getDb()
    .select({
      key: mediaAssets.key,
      url: mediaAssets.url,
      bytes: mediaAssets.bytes,
      contentType: mediaAssets.contentType,
      storage: mediaAssets.storage,
    })
    .from(mediaAssets)
    .all()
    .map((row) => ({
      ...row,
      storage: row.storage === "s3" ? "s3" : "local",
    }));
}

export async function saveMedia(
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<StoredObject> {
  const stored = await putMediaObject(fileName, bytes, contentType);
  getDb()
    .insert(mediaAssets)
    .values({
      id: nanoid(),
      key: stored.key,
      url: stored.url,
      bytes: stored.bytes,
      contentType: stored.contentType,
      storage: stored.storage,
      createdAt: new Date().toISOString(),
    })
    .run();
  return stored;
}

export async function saveMediaWithName(
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ stored: StoredObject; created: boolean }> {
  const stored = await putMediaObject(fileName, bytes, contentType);
  const db = getDb();
  const inserted = db.insert(mediaAssets)
    .values({
      id: nanoid(),
      key: stored.key,
      url: stored.url,
      bytes: stored.bytes,
      contentType: stored.contentType,
      storage: stored.storage,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: mediaAssets.key })
    .run();
  const created = inserted.changes > 0;
  if (!created) {
    db.update(mediaAssets)
      .set({
        url: stored.url,
        bytes: stored.bytes,
        contentType: stored.contentType,
        storage: stored.storage,
      })
      .where(eq(mediaAssets.key, stored.key))
      .run();
  }
  return { stored, created };
}

export async function removeMedia(name: string): Promise<boolean> {
  const safe = resolveUploadName(name);
  if (!safe) return false;

  const db = getDb();
  const candidates = [
    safe,
    safe.startsWith("media/") ? safe.slice("media/".length) : `media/${safe}`,
  ];

  let row =
    db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.key, candidates[0]!))
      .get() ??
    db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.key, candidates[1]!))
      .get();

  // Fallback: match by display name for older local rows
  if (!row) {
    row = db
      .select()
      .from(mediaAssets)
      .all()
      .find((item) => displayNameFromKey(item.key) === displayNameFromKey(safe));
  }

  if (!row) {
    // Legacy: file on disk but not registered
    return deleteMediaObject(safe, "local");
  }

  const storage = (row.storage === "s3" ? "s3" : "local") as StorageBackend;
  const deleted = await deleteMediaObject(row.key, storage);
  db.delete(mediaAssets).where(eq(mediaAssets.id, row.id)).run();
  return deleted;
}
