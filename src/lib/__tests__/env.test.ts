import { describe, expect, it } from "vitest";
import {
  normalizeCogDocApiUrl,
  productionCredentialIssues,
} from "@/lib/env";

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

describe("normalizeCogDocApiUrl", () => {
  it("normalizes an HTTPS origin and strips the root slash", () => {
    expect(normalizeCogDocApiUrl("HTTPS://CogDoc.Example:443/", {
      nodeEnv: "production",
      allowInsecureHttp: false,
    })).toBe("https://cogdoc.example");
  });

  it.each([
    "ftp://cogdoc.example",
    "https://user:password@cogdoc.example",
    "https://cogdoc.example/v1",
    "https://cogdoc.example?target=other",
    "https://cogdoc.example#fragment",
    "https://cogdoc.example.",
    "https://127.1",
    "https://cogdoc.example:00443",
  ])("rejects an unsafe or ambiguous configured origin: %s", (value) => {
    expect(() => normalizeCogDocApiUrl(value, {
      nodeEnv: "production",
      allowInsecureHttp: false,
    })).toThrow("Invalid COGDOC_API_URL");
  });

  it("rejects production HTTP unless the server-only opt-in is enabled", () => {
    expect(() => normalizeCogDocApiUrl("http://cogdoc.internal:8000", {
      nodeEnv: "production",
      allowInsecureHttp: false,
    })).toThrow("COGDOC_API_URL must use HTTPS in production");
    expect(normalizeCogDocApiUrl("http://cogdoc.internal:8000", {
      nodeEnv: "production",
      allowInsecureHttp: true,
    })).toBe("http://cogdoc.internal:8000");
    expect(normalizeCogDocApiUrl("http://127.0.0.1:8000", {
      nodeEnv: "development",
      allowInsecureHttp: false,
    })).toBe("http://127.0.0.1:8000");
  });

  it("never includes a credentialed URL in validation errors", () => {
    const credentialed = "https://canary-user:canary-password@cogdoc.example";
    const error = (() => {
      try {
        normalizeCogDocApiUrl(credentialed, {
          nodeEnv: "production",
          allowInsecureHttp: false,
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(String(error)).not.toContain("canary-user");
    expect(String(error)).not.toContain("canary-password");
  });
});
