import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  getAdminSessionVersion,
  verifyAdminPassword as verifyPassword,
} from "@/lib/auth/password";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  type AdminSessionPayload,
  parseSessionBody,
} from "@/lib/auth/session-cookie";
import { getEnv } from "@/lib/env";

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encodeSession(payload: AdminSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

function decodeSession(token: string, secret: string): AdminSessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return parseSessionBody(body);
}

export async function createAdminSession(version: number): Promise<void> {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("Cannot create an admin session without a valid credential version");
  }
  const env = getEnv();
  const token = encodeSession(
    {
      role: "admin",
      exp: Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
      version,
    },
    env.SESSION_SECRET,
  );
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const env = getEnv();
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  const payload = decodeSession(token, env.SESSION_SECRET);
  if (!payload) return false;
  return payload.version === getAdminSessionVersion();
}

export function verifyAdminPassword(password: string): boolean {
  return verifyPassword(password);
}
