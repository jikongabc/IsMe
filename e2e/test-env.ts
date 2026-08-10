export const DEFAULT_E2E_ADMIN_PASSWORD = "e2e-admin-password-only";
export const DEFAULT_E2E_SESSION_SECRET =
  "e2e_only_7eF4wQ9mZ2xC8vB5nK3pR6tY1uD0";

export function e2eAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_E2E_ADMIN_PASSWORD;
}
