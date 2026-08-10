import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCurrentPortfolioPack: vi.fn(),
  previewPortfolioPack: vi.fn(),
  applyPortfolioPack: vi.fn(),
  listRegisteredMediaObjects: vi.fn(),
  readMediaObject: vi.fn(),
  saveMediaWithName: vi.fn(),
  removeMedia: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/portfolio-pack/server", () => ({
  readCurrentPortfolioPack: mocks.readCurrentPortfolioPack,
  previewPortfolioPack: mocks.previewPortfolioPack,
  applyPortfolioPack: mocks.applyPortfolioPack,
}));
vi.mock("@/lib/media/registry", () => ({
  listRegisteredMediaObjects: mocks.listRegisteredMediaObjects,
  saveMediaWithName: mocks.saveMediaWithName,
  removeMedia: mocks.removeMedia,
}));
vi.mock("@/lib/media/storage", () => ({
  describeMediaObject: vi.fn((fileName: string) => ({
    key: fileName,
    name: fileName,
    url: `/uploads/${fileName}`,
    storage: "local",
  })),
  readMediaObject: mocks.readMediaObject,
}));

import { createBlankPortfolioPack } from "@/lib/portfolio-pack";
import {
  applyPortfolioBundle,
  createPortfolioBundle,
  PortfolioBundleExportError,
} from "@/lib/portfolio-bundle/server";
import { PORTFOLIO_BUNDLE_VERSION, type PortfolioBundleV1 } from "@/lib/portfolio-bundle";

const timestamp = "2026-08-10T00:00:00.000Z";
const fingerprint = "c".repeat(64);
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const digest = createHash("sha256").update(png).digest("hex");

function pack() {
  const value = createBlankPortfolioPack(timestamp);
  value.sections.profile.avatarUrl = "/uploads/avatar.png";
  return value;
}

function bundle(): PortfolioBundleV1 {
  return {
    version: PORTFOLIO_BUNDLE_VERSION,
    exportedAt: timestamp,
    pack: pack(),
    assets: [{
      sourceUrl: "/uploads/avatar.png",
      contentType: "image/png",
      bytes: png.length,
      sha256: digest,
      dataBase64: png.toString("base64"),
    }],
  };
}

describe("portfolio bundle server orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readCurrentPortfolioPack.mockReturnValue(pack());
    mocks.listRegisteredMediaObjects.mockResolvedValue([{
      key: "avatar.png",
      url: "/uploads/avatar.png",
      bytes: png.length,
      contentType: "image/png",
      storage: "local",
    }]);
    mocks.readMediaObject.mockResolvedValue(png);
    mocks.saveMediaWithName.mockResolvedValue({
      stored: {
        key: `bundle-${digest}.png`,
        name: `bundle-${digest}.png`,
        url: `/uploads/bundle-${digest}.png`,
        bytes: png.length,
        contentType: "image/png",
        storage: "local",
      },
      created: true,
    });
    mocks.applyPortfolioPack.mockReturnValue({
      version: "portfolio-pack.v1",
      appliedAt: timestamp,
      fingerprint,
      selectedSections: ["profile"],
      sections: [],
      warnings: [],
      publicationAdjustments: [],
    });
    mocks.removeMedia.mockResolvedValue(true);
  });

  it("exports only referenced registered media with a digest", async () => {
    const exported = await createPortfolioBundle();
    expect(exported.assets).toHaveLength(1);
    expect(exported.assets[0]).toMatchObject({
      sourceUrl: "/uploads/avatar.png",
      bytes: png.length,
      contentType: "image/png",
      sha256: digest,
    });
    expect(mocks.readMediaObject).toHaveBeenCalledWith("avatar.png", "local", 2 * 1024 * 1024);
  });

  it("refuses a self-contained export when a referenced local file is unregistered", async () => {
    mocks.listRegisteredMediaObjects.mockResolvedValueOnce([]);
    await expect(createPortfolioBundle()).rejects.toBeInstanceOf(PortfolioBundleExportError);
    expect(mocks.readMediaObject).not.toHaveBeenCalled();
  });

  it("stores digest-named media before atomically applying rewritten content", async () => {
    await applyPortfolioBundle({
      bundle: bundle(),
      selection: ["profile"],
      expectedFingerprint: fingerprint,
    });
    expect(mocks.saveMediaWithName).toHaveBeenCalledWith(
      `bundle-${digest}.png`,
      png,
      "image/png",
    );
    expect(mocks.applyPortfolioPack).toHaveBeenCalledWith(expect.objectContaining({
      expectedFingerprint: fingerprint,
      selection: ["profile"],
      incoming: expect.objectContaining({
        sections: expect.objectContaining({
          profile: expect.objectContaining({
            avatarUrl: `/uploads/bundle-${digest}.png`,
          }),
        }),
      }),
    }));
    expect(mocks.removeMedia).not.toHaveBeenCalled();
  });

  it("reclaims media created by a stale or failed database apply", async () => {
    mocks.applyPortfolioPack.mockImplementationOnce(() => {
      throw new Error("stale");
    });
    await expect(applyPortfolioBundle({
      bundle: bundle(),
      selection: ["profile"],
      expectedFingerprint: fingerprint,
    })).rejects.toThrow("stale");
    expect(mocks.removeMedia).toHaveBeenCalledWith(`bundle-${digest}.png`);
  });
});
