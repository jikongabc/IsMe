import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  adminPasswordPolicyIssues,
  isStrongAdminPassword,
  isStrongSessionSecret,
  sessionSecretPolicyIssues,
} from "@/lib/auth/credential-policy";
import {
  CURRENT_ADMIN_PASSWORD_HASH_VERSION,
  hashAdminPassword,
  isCurrentAdminPasswordHash,
  verifyPasswordHash,
} from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validators";

function legacyHash(password: string): string {
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

describe("credential strength policy", () => {
  it("rejects short, common, repeated, and sequential admin passwords", () => {
    expect(adminPasswordPolicyIssues("short").map((issue) => issue.code)).toContain("too_short");
    expect(
      adminPasswordPolicyIssues("replace-with-a-strong-password").map((issue) => issue.code),
    ).toContain("blocked");
    expect(
      adminPasswordPolicyIssues("aaaaaaaaaaaaaaaaaaaa").map((issue) => issue.code),
    ).toContain("low_diversity");
    expect(adminPasswordPolicyIssues("abcabcabcabcabc").map((issue) => issue.code)).toContain(
      "low_diversity",
    );
    expect(adminPasswordPolicyIssues("a1b2c3d4a1b2c3d4").map((issue) => issue.code)).toContain(
      "low_diversity",
    );
    expect(adminPasswordPolicyIssues("abcdefghijklmnop").map((issue) => issue.code)).toContain(
      "low_diversity",
    );
  });

  it("allows password-manager values and long Unicode passphrases without composition rules", () => {
    expect(ADMIN_PASSWORD_MIN_LENGTH).toBe(15);
    expect(isStrongAdminPassword("mT7!zQ2@vN9#pL4$kR8%")) .toBe(true);
    expect(isStrongAdminPassword("深海里的蓝色鲸鱼穿过安静群岛与遥远星光")).toBe(true);
    expect(isStrongAdminPassword("violet lanterns cross the winter harbor")).toBe(true);
  });

  it("requires session secrets to be long, non-placeholder, and non-repetitive", () => {
    expect(isStrongSessionSecret("qH7!vR2@xP9#cM4$zL8%tN6&wS3*yK5?uD1+")).toBe(true);
    expect(
      sessionSecretPolicyIssues("replace-with-at-least-32-random-characters").map(
        (issue) => issue.code,
      ),
    ).toContain("blocked");
    expect(sessionSecretPolicyIssues("x".repeat(40)).map((issue) => issue.code)).toContain(
      "low_diversity",
    );
    expect(isStrongSessionSecret("too-short")).toBe(false);
  });
});

describe("versioned admin password hashes", () => {
  it("creates a recognizable current hash and verifies the normalized password", () => {
    const composed = "Café lanterns drift beyond 2026";
    const decomposed = composed.normalize("NFD");
    const stored = hashAdminPassword(composed);

    expect(stored.startsWith(`${CURRENT_ADMIN_PASSWORD_HASH_VERSION}$`)).toBe(true);
    expect(isCurrentAdminPasswordHash(stored)).toBe(true);
    expect(verifyPasswordHash(composed, stored)).toBe(true);
    expect(verifyPasswordHash(decomposed, stored)).toBe(true);
    expect(verifyPasswordHash("wrong password that is long enough", stored)).toBe(false);
  });

  it("continues to verify legacy scrypt hashes, including passwords below the new minimum", () => {
    const password = "old-pass";
    const stored = legacyHash(password);

    expect(isCurrentAdminPasswordHash(stored)).toBe(false);
    expect(verifyPasswordHash(password, stored)).toBe(true);
    expect(verifyPasswordHash("not-old-pass", stored)).toBe(false);
  });

  it("rejects weak new hashes and malformed version markers", () => {
    expect(() => hashAdminPassword("abcabcabcabcabc")).toThrow(/strength policy/);
    expect(isCurrentAdminPasswordHash("scrypt-v2$bad$bad")).toBe(false);
    expect(verifyPasswordHash("anything", "scrypt-v2$bad$bad")).toBe(false);
    expect(verifyPasswordHash("anything", "argon2$bad$bad")).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("applies the shared policy and confirmation check on the server payload", () => {
    const weak = changePasswordSchema.safeParse({
      currentPassword: "current",
      newPassword: "aaaaaaaaaaaaaaaa",
      confirmPassword: "aaaaaaaaaaaaaaaa",
    });
    expect(weak.success).toBe(false);
    if (!weak.success) {
      expect(weak.error.flatten().fieldErrors.newPassword?.[0]).toMatch(/repeated|sequential/i);
    }

    const mismatch = changePasswordSchema.safeParse({
      currentPassword: "current",
      newPassword: "violet lanterns cross the winter harbor",
      confirmPassword: "violet lanterns cross another harbor",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.flatten().fieldErrors.confirmPassword).toContain(
        "passwords do not match",
      );
    }

    expect(
      changePasswordSchema.safeParse({
        currentPassword: "current",
        newPassword: "violet lanterns cross the winter harbor",
        confirmPassword: "violet lanterns cross the winter harbor",
      }).success,
    ).toBe(true);
  });
});
