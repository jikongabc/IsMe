import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backupDatabase: vi.fn<(destination: string) => Promise<string>>(),
  mkdtemp: vi.fn<(prefix: string) => Promise<string>>(),
  readFile: vi.fn<(filename: string) => Promise<Buffer>>(),
  requireAdmin: vi.fn<(request: Request) => Promise<NextResponse | null>>(),
  rm: vi.fn<
    (directory: string, options: { force: boolean; recursive: boolean }) => Promise<void>
  >(),
  tryAuditRequest: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: mocks.mkdtemp,
  readFile: mocks.readFile,
  rm: mocks.rm,
}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db/backup", () => ({ backupDatabase: mocks.backupDatabase }));
vi.mock("@/lib/audit/log", () => ({ tryAuditRequest: mocks.tryAuditRequest }));

import { POST } from "@/app/api/admin/backup/route";

const tempDirectory = "/tmp/isme-backup-test";
const backupBytes = Buffer.from("synthetic backup bytes");

function request() {
  return new Request("https://portfolio.example/api/admin/backup", {
    method: "POST",
    headers: { origin: "https://portfolio.example" },
  });
}

describe("backup admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.mkdtemp.mockResolvedValue(tempDirectory);
    mocks.backupDatabase.mockImplementation(async (destination) => destination);
    mocks.readFile.mockResolvedValue(backupBytes);
    mocks.rm.mockResolvedValue();
  });

  it("preserves the unauthenticated rejection before backup work", async () => {
    mocks.requireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.mkdtemp).not.toHaveBeenCalled();
    expect(mocks.backupDatabase).not.toHaveBeenCalled();
    expect(mocks.tryAuditRequest).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });

  it("returns a non-cacheable attachment with its exact length and cleans up", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="isme-.*\.db"$/,
    );
    expect(response.headers.get("content-length")).toBe(String(backupBytes.length));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(backupBytes);
    expect(mocks.rm).toHaveBeenCalledWith(tempDirectory, { recursive: true, force: true });
  });

  it("returns a stable error, audits details, and cleans up after backup failure", async () => {
    const detail = "database not found: /sensitive/database.db";
    mocks.backupDatabase.mockRejectedValueOnce(new Error(detail));

    const response = await POST(request());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Backup failed" });
    expect(JSON.stringify(body)).not.toContain(detail);
    expect(JSON.stringify(body)).not.toContain("/sensitive/database.db");
    expect(mocks.tryAuditRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        action: "backup.create",
        ok: false,
        detail: { error: detail },
      }),
    );
    expect(mocks.rm).toHaveBeenCalledWith(tempDirectory, { recursive: true, force: true });
  });
});
