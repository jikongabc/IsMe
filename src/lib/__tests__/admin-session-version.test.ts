import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  let value: string | undefined;
  return {
    get value() {
      return value;
    },
    reset() {
      value = undefined;
    },
    api: {
      get: vi.fn(() => (value ? { value } : undefined)),
      set: vi.fn((_name: string, nextValue: string) => {
        value = nextValue || undefined;
      }),
    },
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieJar.api) }));

import {
  authenticateAdminPassword,
  changeAdminPassword,
  getAdminSessionVersion,
  hashAdminPassword,
} from "@/lib/auth/password";
import { createAdminSession, isAdminAuthenticated } from "@/lib/auth/session";
import { getSqlite, initializeDatabase } from "@/lib/db";

const ENV_PASSWORD = "violet lanterns cross the winter harbor";
const NEW_PASSWORD = "copper constellations cross the quiet harbor";
const FAILED_PASSWORD = "silver observatories watch the distant harbor";
let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "isme-session-test-"));
  process.env.ISME_DATABASE_PATH = path.join(tempDir, "isme.db");
  process.env.ADMIN_PASSWORD = ENV_PASSWORD;
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
  global.__ismeDb = undefined;
  global.__ismeSqlite = undefined;
  cookieJar.reset();
  initializeDatabase();
});

afterEach(() => {
  global.__ismeSqlite?.close();
  global.__ismeDb = undefined;
  global.__ismeSqlite = undefined;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("admin credential session version", () => {
  it("invalidates an issued cookie after a password change and accepts a new login", async () => {
    const oldVersion = authenticateAdminPassword(ENV_PASSWORD);
    expect(oldVersion).toBeGreaterThan(1);
    await createAdminSession(oldVersion!);
    expect(await isAdminAuthenticated()).toBe(true);

    expect(changeAdminPassword(ENV_PASSWORD, hashAdminPassword(NEW_PASSWORD))).toBe(true);
    expect(getAdminSessionVersion()).toBe(oldVersion! + 1);
    expect(await isAdminAuthenticated()).toBe(false);
    expect(authenticateAdminPassword(ENV_PASSWORD)).toBeNull();

    const newVersion = authenticateAdminPassword(NEW_PASSWORD);
    expect(newVersion).toBe(oldVersion! + 1);
    await createAdminSession(newVersion!);
    expect(await isAdminAuthenticated()).toBe(true);
  });

  it("rolls back both the password hash and version when the database update fails", () => {
    expect(changeAdminPassword(ENV_PASSWORD, hashAdminPassword(NEW_PASSWORD))).toBe(true);
    const oldVersion = authenticateAdminPassword(NEW_PASSWORD)!;
    const sqlite = getSqlite();
    sqlite.exec(`
      CREATE TRIGGER fail_admin_password_update
      BEFORE UPDATE OF admin_password_hash ON site_profiles
      BEGIN
        SELECT RAISE(ABORT, 'forced password update failure');
      END;
    `);

    expect(() =>
      changeAdminPassword(NEW_PASSWORD, hashAdminPassword(FAILED_PASSWORD)),
    ).toThrow(/forced password update failure/);
    expect(getAdminSessionVersion()).toBe(oldVersion);
    expect(authenticateAdminPassword(NEW_PASSWORD)).toBe(oldVersion);
    expect(authenticateAdminPassword(FAILED_PASSWORD)).toBeNull();
  });
});
