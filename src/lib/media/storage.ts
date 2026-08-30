import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getEnv,
  isS3Configured,
  isS3ForcePathStyle,
} from "@/lib/env";
import {
  displayNameFromKey,
  objectKeyForStorage,
  resolveUploadName,
} from "@/lib/media/keys";
import { buildS3PublicUrl } from "@/lib/media/public-url";

export type StorageBackend = "local" | "s3";

export type StoredObject = {
  key: string;
  name: string;
  url: string;
  bytes: number;
  contentType: string;
  storage: StorageBackend;
};

export type MediaObjectDestination = Omit<StoredObject, "bytes" | "contentType">;

export type MediaObjectDeleteResult = "deleted" | "not_found";

export class MediaObjectAlreadyExistsError extends Error {
  constructor() {
    super("Media object already exists");
    this.name = "MediaObjectAlreadyExistsError";
  }
}

function uploadsDir(): string {
  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "public",
    "uploads",
  );
}

export function storageBackend(): StorageBackend {
  return isS3Configured() ? "s3" : "local";
}

export function describeMediaObject(fileName: string): MediaObjectDestination {
  const storage = storageBackend();
  const key = objectKeyForStorage(fileName, storage);
  const name = displayNameFromKey(key);
  if (storage === "s3") {
    const env = getEnv();
    return {
      key,
      name,
      url: buildS3PublicUrl({
        key,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL,
        endpoint: env.S3_ENDPOINT,
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
      }),
      storage,
    };
  }
  return { key, name, url: `/uploads/${name}`, storage };
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const env = getEnv();
  s3Client = new S3Client({
    region: env.S3_REGION.trim() || "auto",
    endpoint: env.S3_ENDPOINT.trim() || undefined,
    forcePathStyle: isS3ForcePathStyle() || Boolean(env.S3_ENDPOINT.trim()),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

function destroyStream(value: unknown): void {
  if (
    typeof value === "object"
    && value !== null
    && "destroy" in value
    && typeof value.destroy === "function"
  ) {
    value.destroy();
  }
}

export async function putMediaObject(
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<StoredObject> {
  const destination = describeMediaObject(fileName);
  const { key, name, storage: backend } = destination;

  if (backend === "s3") {
    const env = getEnv();
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.length,
      }),
    );
    return {
      key,
      name,
      url: destination.url,
      bytes: bytes.length,
      contentType,
      storage: "s3",
    };
  }

  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return {
    key: name,
    name,
    url: `/uploads/${name}`,
    bytes: bytes.length,
    contentType,
    storage: "local",
  };
}

function isStorageStatus(error: unknown, status: number): boolean {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) {
    return false;
  }
  const metadata = error.$metadata;
  return typeof metadata === "object"
    && metadata !== null
    && "httpStatusCode" in metadata
    && metadata.httpStatusCode === status;
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === name;
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}

/** Create a new upload object without ever replacing an existing key. */
export async function createMediaObject(
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<StoredObject> {
  const destination = describeMediaObject(fileName);
  const { key, name, storage: backend } = destination;

  if (backend === "s3") {
    const env = getEnv();
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          ContentLength: bytes.length,
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      if (isStorageStatus(error, 412) || isNamedError(error, "PreconditionFailed")) {
        throw new MediaObjectAlreadyExistsError();
      }
      throw error;
    }
    return {
      key,
      name,
      url: destination.url,
      bytes: bytes.length,
      contentType,
      storage: "s3",
    };
  }

  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(path.join(dir, name), bytes, { flag: "wx" });
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) {
      throw new MediaObjectAlreadyExistsError();
    }
    throw error;
  }
  return {
    key: name,
    name,
    url: `/uploads/${name}`,
    bytes: bytes.length,
    contentType,
    storage: "local",
  };
}

export async function readMediaObject(
  keyOrName: string,
  storage: StorageBackend,
  maxBytes: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Invalid media read limit");
  }
  if (storage === "local") {
    const safe = resolveUploadName(displayNameFromKey(keyOrName));
    if (!safe || safe.includes("/")) throw new Error("Invalid local media key");
    const filePath = path.join(uploadsDir(), safe);
    const info = await stat(filePath);
    if (!info.isFile() || info.size > maxBytes) throw new Error("Media object exceeds export limit");
    const bytes = await readFile(filePath);
    if (bytes.length > maxBytes) throw new Error("Media object exceeds export limit");
    return bytes;
  }

  const safe = resolveUploadName(keyOrName);
  if (!safe) throw new Error("Invalid S3 media key");
  const key = safe.startsWith("media/") ? safe : objectKeyForStorage(safe, "s3");
  const env = getEnv();
  const response = await getS3Client().send(new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  }));
  if ((response.ContentLength ?? 0) > maxBytes) {
    destroyStream(response.Body);
    throw new Error("Media object exceeds export limit");
  }
  if (!response.Body) throw new Error("Media object has no body");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      destroyStream(response.Body);
      throw new Error("Media object exceeds export limit");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export async function deleteMediaObject(
  keyOrName: string,
  storage: StorageBackend,
): Promise<MediaObjectDeleteResult> {
  if (storage === "s3") {
    const key = objectKeyForStorage(keyOrName, "s3");
    try {
      const env = getEnv();
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
        }),
      );
      return "deleted";
    } catch (error) {
      if (isStorageStatus(error, 404) || isNamedError(error, "NoSuchKey")) {
        return "not_found";
      }
      throw error;
    }
  }

  const safe = resolveUploadName(displayNameFromKey(keyOrName));
  if (!safe) throw new Error("Invalid local media key");
  try {
    await unlink(path.join(uploadsDir(), safe));
    return "deleted";
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) {
      return "not_found";
    }
    throw error;
  }
}

/** Scan local public/uploads for backfill into media_assets. */
export async function listLocalDiskFiles(): Promise<
  Array<{ name: string; bytes: number; modifiedAt: string }>
> {
  const dir = uploadsDir();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const items: Array<{ name: string; bytes: number; modifiedAt: string }> = [];
  for (const name of names) {
    const safe = resolveUploadName(name);
    if (!safe || safe.includes("/")) continue;
    try {
      const info = await stat(path.join(dir, safe));
      if (!info.isFile()) continue;
      items.push({
        name: safe,
        bytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    } catch {
      // skip
    }
  }
  return items;
}

export function guessContentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
