import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import {
  isStrongAdminPassword,
  normalizeAdminPassword,
} from "@/lib/auth/credential-policy";
import { getDb } from "@/lib/db";
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
  const db = getDb();
  const existing = db.select().from(siteProfiles).limit(1).all()[0];
  const timestamp = new Date().toISOString();
  if (!existing) {
    db.insert(siteProfiles)
      .values({
        id: `profile_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        siteName: "IsMe",
        adminPasswordHash: hash,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return;
  }
  db.update(siteProfiles)
    .set({ adminPasswordHash: hash, updatedAt: timestamp })
    .where(eq(siteProfiles.id, existing.id))
    .run();
}

export function clearAdminPasswordHash(): void {
  setAdminPasswordHash("");
}

export function hasDbPasswordOverride(): boolean {
  return Boolean(getStoredAdminPasswordHash());
}
