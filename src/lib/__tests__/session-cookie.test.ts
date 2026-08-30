import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hmacSha256Base64Url,
  parseSessionBody,
  verifyAdminSessionToken,
} from "@/lib/auth/session-cookie";

const SECRET = "test-session-secret-at-least-32-chars!!";

function nodeSign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

describe("session cookie crypto", () => {
  it("matches Node HMAC base64url", async () => {
    const body = Buffer.from(
      JSON.stringify({ role: "admin", exp: Date.now() + 60_000, version: 17 }),
    ).toString("base64url");
    const edge = await hmacSha256Base64Url(body, SECRET);
    expect(edge).toBe(nodeSign(body));
  });

  it("verifies a Node-issued token", async () => {
    const body = Buffer.from(
      JSON.stringify({ role: "admin", exp: Date.now() + 60_000, version: 17 }),
    ).toString("base64url");
    const token = `${body}.${nodeSign(body)}`;
    expect(await verifyAdminSessionToken(token, SECRET)).toBe(true);
  });

  it("rejects forged or expired tokens", async () => {
    const body = Buffer.from(
      JSON.stringify({ role: "admin", exp: Date.now() - 1, version: 17 }),
    ).toString("base64url");
    expect(await verifyAdminSessionToken(`${body}.${nodeSign(body)}`, SECRET)).toBe(
      false,
    );
    expect(await verifyAdminSessionToken("a.b", SECRET)).toBe(false);
    expect(await verifyAdminSessionToken(`${body}.deadbeef`, SECRET)).toBe(false);
  });

  it("parses valid session bodies", () => {
    const body = Buffer.from(
      JSON.stringify({ role: "admin", exp: Date.now() + 1000, version: 17 }),
    ).toString("base64url");
    expect(parseSessionBody(body)?.role).toBe("admin");
  });

  it("rejects legacy payloads without a credential version", async () => {
    const body = Buffer.from(
      JSON.stringify({ role: "admin", exp: Date.now() + 60_000 }),
    ).toString("base64url");

    expect(parseSessionBody(body)).toBeNull();
    expect(await verifyAdminSessionToken(`${body}.${nodeSign(body)}`, SECRET)).toBe(false);
  });
});
