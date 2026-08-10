/** Pure credential policy shared by request validation and launch readiness. */

export const ADMIN_PASSWORD_MIN_LENGTH = 15;
export const ADMIN_PASSWORD_MAX_LENGTH = 200;
export const SESSION_SECRET_MIN_LENGTH = 32;
export const SESSION_SECRET_MAX_LENGTH = 4_096;

export type CredentialPolicyIssueCode =
  | "required"
  | "too_short"
  | "too_long"
  | "blocked"
  | "low_diversity";

export type CredentialPolicyIssue = {
  code: CredentialPolicyIssueCode;
  message: string;
};

const BLOCKED_ADMIN_PASSWORDS = new Set([
  "correct horse battery staple",
  "letmeinletmein",
  "password123456",
  "passwordpassword",
  "qwertyuiop12345",
  "qwertyuiopasdfgh",
  "replace-with-a-strong-password",
]);

const BLOCKED_SESSION_SECRETS = new Set([
  "replace-with-at-least-32-random-characters",
  "replace-with-a-random-session-secret",
]);

function codePoints(value: string): string[] {
  return Array.from(value);
}

function isRepeatedPattern(value: string): boolean {
  const characters = codePoints(value);
  for (let size = 1; size <= Math.floor(characters.length / 2); size += 1) {
    if (characters.length % size !== 0) continue;
    const unit = characters.slice(0, size);
    if (characters.every((character, index) => character === unit[index % size])) return true;
  }
  return false;
}

function hasLongAsciiSequence(value: string): boolean {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact.length < 8) return false;

  let ascending = 1;
  let descending = 1;
  for (let index = 1; index < compact.length; index += 1) {
    const difference = compact.charCodeAt(index) - compact.charCodeAt(index - 1);
    ascending = difference === 1 ? ascending + 1 : 1;
    descending = difference === -1 ? descending + 1 : 1;
    if (ascending >= 8 || descending >= 8) return true;
  }
  return false;
}

function isPathologicallyLowDiversity(value: string, minimumUnique: number): boolean {
  const characters = codePoints(value);
  if (new Set(characters).size < minimumUnique) return true;
  return isRepeatedPattern(value) || hasLongAsciiSequence(value);
}

function blockedAdminPassword(value: string): boolean {
  const lower = value.toLowerCase().trim();
  if (BLOCKED_ADMIN_PASSWORDS.has(lower)) return true;

  const compact = lower.replace(/[^a-z0-9]/g, "");
  return (
    /^(?:password){1,3}\d*$/.test(compact) ||
    /^(?:admin|administrator|letmein|welcome|changeme|qwertyuiop)\d*$/.test(compact) ||
    /^(?:isme|ismeadmin|ismeportfolio)\d*$/.test(compact)
  );
}

export function normalizeAdminPassword(value: string): string {
  return value.normalize("NFC");
}

export function adminPasswordPolicyIssues(value: unknown): CredentialPolicyIssue[] {
  if (typeof value !== "string" || value.length === 0) {
    return [{ code: "required", message: "Enter a new password." }];
  }

  const normalized = normalizeAdminPassword(value);
  const length = codePoints(normalized).length;
  const issues: CredentialPolicyIssue[] = [];
  if (length < ADMIN_PASSWORD_MIN_LENGTH) {
    issues.push({
      code: "too_short",
      message: `Use at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
    });
  }
  if (length > ADMIN_PASSWORD_MAX_LENGTH) {
    issues.push({
      code: "too_long",
      message: `Use no more than ${ADMIN_PASSWORD_MAX_LENGTH} characters.`,
    });
  }
  if (blockedAdminPassword(normalized)) {
    issues.push({
      code: "blocked",
      message: "Choose a password that is not a common, example, or IsMe-specific phrase.",
    });
  }
  if (length >= ADMIN_PASSWORD_MIN_LENGTH && isPathologicallyLowDiversity(normalized, 6)) {
    issues.push({
      code: "low_diversity",
      message: "Avoid repeated or sequential patterns; use a generated password or long passphrase.",
    });
  }
  return issues;
}

export function isStrongAdminPassword(value: unknown): value is string {
  return adminPasswordPolicyIssues(value).length === 0;
}

function blockedSessionSecret(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return (
    BLOCKED_SESSION_SECRETS.has(lower) ||
    lower.includes("replace-with") ||
    lower.includes("never-use-in-production") ||
    lower.includes("development-only")
  );
}

export function sessionSecretPolicyIssues(value: unknown): CredentialPolicyIssue[] {
  if (typeof value !== "string" || value.length === 0) {
    return [{ code: "required", message: "Configure a random session secret." }];
  }

  const length = codePoints(value).length;
  const issues: CredentialPolicyIssue[] = [];
  if (length < SESSION_SECRET_MIN_LENGTH) {
    issues.push({
      code: "too_short",
      message: `Use at least ${SESSION_SECRET_MIN_LENGTH} random characters.`,
    });
  }
  if (length > SESSION_SECRET_MAX_LENGTH) {
    issues.push({
      code: "too_long",
      message: `Use no more than ${SESSION_SECRET_MAX_LENGTH} characters.`,
    });
  }
  if (blockedSessionSecret(value)) {
    issues.push({
      code: "blocked",
      message: "Replace the example session secret with a randomly generated value.",
    });
  }
  if (length >= SESSION_SECRET_MIN_LENGTH && isPathologicallyLowDiversity(value, 10)) {
    issues.push({
      code: "low_diversity",
      message: "Use a cryptographically random session secret instead of a repeated pattern.",
    });
  }
  return issues;
}

export function isStrongSessionSecret(value: unknown): value is string {
  return sessionSecretPolicyIssues(value).length === 0;
}
