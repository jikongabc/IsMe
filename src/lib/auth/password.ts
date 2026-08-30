import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import {
  isStrongAdminPassword,
  normalizeAdminPassword,
} from "@/lib/auth/credential-policy";
import { getDb, getSqlite } from "@/lib/db";
import { siteProfiles } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

export const CURRENT_ADMIN_PASSWORD_HASH_VERSION = "scrypt-v2";
const LEGACY_ADMIN_PASSWORD_HASH_VERSION = "scrypt";

function hashWithSalt(password: string, salt: string): Buffer {
  return scryptSync(password, salt, 64);
}

export function hashAdminPassword(password: string): string {
  if (!isStrongAdminPassword(password)) {
    throw new Error("Admin password does not meet the current strength policy");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = hashWithSalt(normalizeAdminPassword(password), salt).toString("hex");
  return `${CURRENT_ADMIN_PASSWORD_HASH_VERSION}$${salt}$${hash}`;
}

function validHashParts(salt: string, hash: string): boolean {
  return /^[a-f0-9]{32}$/i.test(salt) && /^[a-f0-9]{128}$/i.test(hash);
}

/** True only for a well-formed hash created under the current password policy. */
export function isCurrentAdminPasswordHash(stored: string): boolean {
  const [version, salt, hash, extra] = stored.split("$");
  return (
    version === CURRENT_ADMIN_PASSWORD_HASH_VERSION &&
    extra === undefined &&
    Boolean(salt && hash && validHashParts(salt, hash))
  );
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [version, salt, hash, extra] = stored.split("$");
  if (
    (version !== CURRENT_ADMIN_PASSWORD_HASH_VERSION &&
      version !== LEGACY_ADMIN_PASSWORD_HASH_VERSION) ||
    !salt ||
    !hash ||
    extra !== undefined ||
    !validHashParts(salt, hash)
  ) {
    return false;
  }
  try {
    const candidate =
      version === CURRENT_ADMIN_PASSWORD_HASH_VERSION
        ? normalizeAdminPassword(password)
        : password;
    const actual = hashWithSalt(candidate, salt);
    const expected = Buffer.from(hash, "hex");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function verifyEnvPassword(password: string): boolean {
  const env = getEnv();
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(env.ADMIN_PASSWORD).digest();
  return timingSafeEqual(a, b);
}

type AdminCredentialRow = {
  id: string;
  adminPasswordHash: string;
  adminSessionVersion: number;
};

function readAdminCredentialRow(): AdminCredentialRow | undefined {
  return getSqlite()
    .prepare(
      `SELECT
        id,
        admin_password_hash AS adminPasswordHash,
        admin_session_version AS adminSessionVersion
      FROM site_profiles
      LIMIT 1`,
    )
    .get() as AdminCredentialRow | undefined;
}

function initialAdminSessionVersion(): number {
  return randomInt(1_000_000_000, 2_000_000_000);
}

function environmentAdminSessionVersion(): number {
  const digest = createHmac("sha256", getEnv().SESSION_SECRET)
    .update("isme:admin-session-version:v1")
    .digest();
  return 1_000_000_000 + (digest.readUInt32BE(0) % 1_000_000_000);
}

function normalizeStoredSessionVersion(row: AdminCredentialRow): number {
  if (Number.isSafeInteger(row.adminSessionVersion) && row.adminSessionVersion > 0) {
    return row.adminSessionVersion;
  }

  const version = initialAdminSessionVersion();
  getSqlite()
    .prepare(
      `UPDATE site_profiles
       SET admin_session_version = ?
       WHERE id = ? AND admin_session_version <= 0`,
    )
    .run(version, row.id);
  return readAdminCredentialRow()?.adminSessionVersion ?? version;
}

export function getAdminSessionVersion(): number {
  const sqlite = getSqlite();
  const read = sqlite.transaction(() => {
    const row = readAdminCredentialRow();
    return row ? normalizeStoredSessionVersion(row) : environmentAdminSessionVersion();
  });
  return read.immediate();
}

/** Verify a login and capture the exact credential generation it authenticated. */
export function authenticateAdminPassword(password: string): number | null {
  const sqlite = getSqlite();
  const authenticate = sqlite.transaction(() => {
    const row = readAdminCredentialRow();
    const valid = row?.adminPasswordHash?.trim()
      ? verifyPasswordHash(password, row.adminPasswordHash)
      : verifyEnvPassword(password);
    if (!valid) return null;
    return row ? normalizeStoredSessionVersion(row) : environmentAdminSessionVersion();
  });
  return authenticate.immediate();
}

/** Atomically replace the password hash and advance the credential generation. */
export function changeAdminPassword(currentPassword: string, newHash: string): boolean {
  if (!isCurrentAdminPasswordHash(newHash)) {
    throw new Error("New admin password hash is malformed");
  }

  const sqlite = getSqlite();
  const change = sqlite.transaction(() => {
    const row = readAdminCredentialRow();
    const valid = row?.adminPasswordHash?.trim()
      ? verifyPasswordHash(currentPassword, row.adminPasswordHash)
      : verifyEnvPassword(currentPassword);
    if (!valid) return false;

    const currentVersion = row
      ? normalizeStoredSessionVersion(row)
      : environmentAdminSessionVersion();
    if (!Number.isSafeInteger(currentVersion + 1)) {
      throw new Error("Admin session version cannot be advanced safely");
    }
    const timestamp = new Date().toISOString();

    if (!row) {
      sqlite
        .prepare(
          `INSERT INTO site_profiles (
            id, site_name, admin_password_hash, admin_session_version, created_at, updated_at
          ) VALUES (?, 'IsMe', ?, ?, ?, ?)`,
        )
        .run(
          `profile_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
          newHash,
          currentVersion + 1,
          timestamp,
          timestamp,
        );
    } else {
      sqlite
        .prepare(
          `UPDATE site_profiles
           SET admin_password_hash = ?, admin_session_version = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(newHash, currentVersion + 1, timestamp, row.id);
    }
    return true;
  });
  return change.immediate();
}

export function getStoredAdminPasswordHash(): string {
  const profile = getDb().select().from(siteProfiles).limit(1).all()[0];
  return profile?.adminPasswordHash?.trim() || "";
}

export function verifyAdminPassword(password: string): boolean {
  const stored = getStoredAdminPasswordHash();
  if (stored) return verifyPasswordHash(password, stored);
  return verifyEnvPassword(password);
}

export function setAdminPasswordHash(hash: string): void {
  const sqlite = getSqlite();
  const update = sqlite.transaction(() => {
    const existing = readAdminCredentialRow();
    const timestamp = new Date().toISOString();
    const currentVersion = existing
      ? normalizeStoredSessionVersion(existing)
      : environmentAdminSessionVersion();
    if (!existing) {
      getDb()
        .insert(siteProfiles)
        .values({
          id: `profile_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
          siteName: "IsMe",
          adminPasswordHash: hash,
          adminSessionVersion: currentVersion + 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      return;
    }
    getDb()
      .update(siteProfiles)
      .set({
        adminPasswordHash: hash,
        adminSessionVersion: currentVersion + 1,
        updatedAt: timestamp,
      })
      .where(eq(siteProfiles.id, existing.id))
      .run();
  });
  update.immediate();
}

export function clearAdminPasswordHash(): void {
  setAdminPasswordHash("");
}

export function hasDbPasswordOverride(): boolean {
  return Boolean(getStoredAdminPasswordHash());
}
