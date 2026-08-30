import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  s3: false,
  send: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    S3_REGION: "auto",
    S3_ENDPOINT: "https://storage.internal.example",
    S3_BUCKET: "private-bucket",
    S3_ACCESS_KEY_ID: "access",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_PUBLIC_BASE_URL: "https://cdn.example.test",
  }),
  isS3Configured: () => mocks.s3,
  isS3ForcePathStyle: () => true,
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    DeleteObjectCommand: Command,
    GetObjectCommand: Command,
    PutObjectCommand: Command,
    S3Client: class {
      send = mocks.send;
    },
  };
});

import {
  createMediaObject,
  deleteMediaObject,
  MediaObjectAlreadyExistsError,
} from "@/lib/media/storage";

const localName = `storage-fault-${process.pid}-${Date.now()}.png`;
const localPath = path.join(process.cwd(), "public", "uploads", localName);

describe("media storage fault handling", () => {
  beforeEach(() => {
    mocks.s3 = false;
    mocks.send.mockReset();
  });

  afterEach(async () => {
    await rm(localPath, { recursive: true, force: true });
  });

  it("creates local uploads without replacing an existing object", async () => {
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, Buffer.from("original"));

    await expect(
      createMediaObject(localName, Buffer.from("replacement"), "image/png"),
    ).rejects.toBeInstanceOf(MediaObjectAlreadyExistsError);
    await expect(readFile(localPath)).resolves.toEqual(Buffer.from("original"));
  });

  it("distinguishes local deletion, absence, and transient failure", async () => {
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, Buffer.from("object"));
    await expect(deleteMediaObject(localName, "local")).resolves.toBe("deleted");
    await expect(deleteMediaObject(localName, "local")).resolves.toBe("not_found");

    await mkdir(localPath);
    await expect(deleteMediaObject(localName, "local")).rejects.toBeTruthy();
  });

  it("uses an S3 conditional put and maps only precondition failure to collision", async () => {
    mocks.s3 = true;
    mocks.send.mockResolvedValueOnce({});

    await createMediaObject("fresh.png", Buffer.from("image"), "image/png");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        Key: "media/fresh.png",
        IfNoneMatch: "*",
      }),
    }));

    mocks.send.mockRejectedValueOnce(Object.assign(new Error("raw SDK detail"), {
      name: "PreconditionFailed",
      $metadata: { httpStatusCode: 412 },
    }));
    await expect(
      createMediaObject("existing.png", Buffer.from("image"), "image/png"),
    ).rejects.toBeInstanceOf(MediaObjectAlreadyExistsError);

    mocks.send.mockRejectedValueOnce(Object.assign(new Error("temporary put failure"), {
      $metadata: { httpStatusCode: 503 },
    }));
    await expect(
      createMediaObject("unavailable.png", Buffer.from("image"), "image/png"),
    ).rejects.toThrow("temporary put failure");
  });

  it("does not fold S3 delete failures into a successful absence", async () => {
    mocks.s3 = true;
    mocks.send.mockResolvedValueOnce({});
    await expect(deleteMediaObject("fresh.png", "s3")).resolves.toBe("deleted");
    expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({
      input: expect.objectContaining({ Key: "media/fresh.png" }),
    }));

    mocks.send.mockRejectedValueOnce(Object.assign(new Error("temporary endpoint failure"), {
      $metadata: { httpStatusCode: 503 },
    }));
    await expect(deleteMediaObject("fresh.png", "s3")).rejects.toThrow(
      "temporary endpoint failure",
    );

    mocks.send.mockRejectedValueOnce(Object.assign(new Error("missing"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    }));
    await expect(deleteMediaObject("fresh.png", "s3")).resolves.toBe("not_found");
  });
});
