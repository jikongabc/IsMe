import { describe, expect, it } from "vitest";
import {
  displayNameFromKey,
  objectKeyForStorage,
  resolveUploadName,
} from "@/lib/media/keys";
import { buildS3PublicUrl } from "@/lib/media/public-url";

describe("resolveUploadName", () => {
  it("accepts plain filenames", () => {
    expect(resolveUploadName("123_abcd.jpg")).toBe("123_abcd.jpg");
  });

  it("accepts media/ prefixed keys", () => {
    expect(resolveUploadName("media/123_abcd.jpg")).toBe("media/123_abcd.jpg");
  });

  it("rejects traversal and odd paths", () => {
    expect(resolveUploadName("../secret")).toBeNull();
    expect(resolveUploadName("/etc/passwd")).toBeNull();
    expect(resolveUploadName("a/b.jpg")).toBeNull();
    expect(resolveUploadName(".hidden")).toBeNull();
  });
});

describe("objectKeyForStorage", () => {
  it("prefixes s3 keys with media/", () => {
    expect(objectKeyForStorage("photo.png", "s3")).toBe("media/photo.png");
    expect(objectKeyForStorage("media/photo.png", "s3")).toBe("media/photo.png");
  });

  it("strips media/ for local", () => {
    expect(objectKeyForStorage("media/photo.png", "local")).toBe("photo.png");
    expect(objectKeyForStorage("photo.png", "local")).toBe("photo.png");
  });
});

describe("displayNameFromKey", () => {
  it("returns basename for media keys", () => {
    expect(displayNameFromKey("media/a.jpg")).toBe("a.jpg");
    expect(displayNameFromKey("a.jpg")).toBe("a.jpg");
  });
});

describe("buildS3PublicUrl", () => {
  it("prefers public base URL", () => {
    expect(
      buildS3PublicUrl({
        key: "media/a.jpg",
        publicBaseUrl: "https://cdn.example.com/",
        endpoint: "https://xxx.r2.cloudflarestorage.com",
        bucket: "isme",
        region: "auto",
      }),
    ).toBe("https://cdn.example.com/media/a.jpg");
  });

  it("falls back to path-style endpoint", () => {
    expect(
      buildS3PublicUrl({
        key: "media/a.jpg",
        publicBaseUrl: "",
        endpoint: "http://localhost:9000",
        bucket: "isme",
        region: "us-east-1",
      }),
    ).toBe("http://localhost:9000/isme/media/a.jpg");
  });

  it("falls back to virtual-hosted AWS URL", () => {
    expect(
      buildS3PublicUrl({
        key: "media/a.jpg",
        publicBaseUrl: "",
        endpoint: "",
        bucket: "isme",
        region: "ap-northeast-1",
      }),
    ).toBe("https://isme.s3.ap-northeast-1.amazonaws.com/media/a.jpg");
  });
});
