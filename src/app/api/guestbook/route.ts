import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIpFromRequest } from "@/lib/auth/client-ip";
import { getHashSecret } from "@/lib/auth/hash-secret";
import { createGuestbookMessage } from "@/lib/guestbook/store";
import { takeToken } from "@/lib/rate-limit";
import { guestbookSchema } from "@/lib/validators";

export const runtime = "nodejs";

function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${getHashSecret()}:gb:${ip}`)
    .digest("hex")
    .slice(0, 24);
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);

  if (!takeToken(`guestbook:${ip}`, { limit: 5, windowMs: 60 * 60_000 })) {
    return NextResponse.json({ error: "Too many messages — try later" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = guestbookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Honeypot filled → pretend success without storing.
  if (parsed.data.website?.trim()) {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  createGuestbookMessage({
    name: parsed.data.name,
    email: parsed.data.email || "",
    body: parsed.data.body,
    ipHash: hashIp(ip),
  });

  return NextResponse.json({ ok: true, status: "pending" });
}
