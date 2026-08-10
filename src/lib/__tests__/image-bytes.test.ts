import { describe, expect, it } from "vitest";
import { detectImageMime } from "@/lib/media/image-bytes";

describe("detectImageMime", () => {
  it("detects jpeg/png/gif/webp magic", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(12)]);
    expect(detectImageMime(jpeg)).toBe("image/jpeg");

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(8),
    ]);
    expect(detectImageMime(png)).toBe("image/png");

    const gif = Buffer.from("GIF89a......", "binary");
    expect(detectImageMime(gif)).toBe("image/gif");

    const webp = Buffer.alloc(16);
    webp.write("RIFF", 0);
    webp.write("WEBP", 8);
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("rejects non-images", () => {
    expect(detectImageMime(Buffer.from("<html></html>"))).toBeNull();
    expect(detectImageMime(Buffer.from("%PDF-1.4"))).toBeNull();
  });
});
