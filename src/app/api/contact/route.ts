import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIpFromRequest } from "@/lib/auth/client-ip";
import { getHashSecret } from "@/lib/auth/hash-secret";
import { createContactMessage } from "@/lib/contact/store";
import { takeToken } from "@/lib/rate-limit";
import { contactSchema } from "@/lib/validators";

export const runtime = "nodejs";

function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${getHashSecret()}:contact:${ip}`)
    .digest("hex")
    .slice(0, 24);
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!takeToken(`contact:${ip}`, { limit: 5, windowMs: 60 * 60_000 })) {
    return NextResponse.json({ error: "Too many messages — try later" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid contact payload" }, { status: 400 });
  }

  if (parsed.data.company?.trim()) {
    return NextResponse.json({ ok: true });
  }

  createContactMessage({
    name: parsed.data.name,
    email: parsed.data.email,
    subject: parsed.data.subject,
    body: parsed.data.body,
    ipHash: hashIp(ip),
  });

  return NextResponse.json({ ok: true });
}
