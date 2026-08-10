import { describe, expect, it } from "vitest";
import { productionCredentialIssues } from "@/lib/env";

describe("productionCredentialIssues", () => {
  const safe = {
    ADMIN_PASSWORD: "a-unique-admin-password",
    SESSION_SECRET: "a-unique-session-secret-that-is-long-enough",
  };

  it("rejects documented placeholder credentials in production", () => {
    expect(
      productionCredentialIssues(
        {
          ADMIN_PASSWORD: "replace-with-a-strong-password",
          SESSION_SECRET: "replace-with-at-least-32-random-characters",
        },
        "production",
      ),
    ).toEqual(["ADMIN_PASSWORD", "SESSION_SECRET"]);
  });

  it("rejects common passwords and low-diversity session secrets in production", () => {
    expect(
      productionCredentialIssues(
        {
          ADMIN_PASSWORD: "password",
          SESSION_SECRET: "a".repeat(32),
        },
        "production",
      ),
    ).toEqual(["ADMIN_PASSWORD", "SESSION_SECRET"]);
  });

  it("allows secure production values and development placeholders", () => {
    expect(productionCredentialIssues(safe, "production")).toEqual([]);
    expect(
      productionCredentialIssues(
        {
          ADMIN_PASSWORD: "replace-with-a-strong-password",
          SESSION_SECRET: "replace-with-at-least-32-random-characters",
        },
        "development",
      ),
    ).toEqual([]);
  });
});
