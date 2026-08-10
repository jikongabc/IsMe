import { NextResponse } from "next/server";
import { classifyDevice, detectCountry } from "@/lib/analytics/device";
import {
  hashVisitor,
  tryRecordPageView,
} from "@/lib/analytics/page-views";
import { clientIpFromRequest } from "@/lib/auth/client-ip";
import { takeToken } from "@/lib/rate-limit";
import { pageViewSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);

  if (!takeToken(`pageview:${ip}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ ok: true, skipped: "rate_limited" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = pageViewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pageview" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent") || "";
  tryRecordPageView({
    path: parsed.data.path,
    referrer: parsed.data.referrer,
    locale: parsed.data.locale,
    visitorHash: hashVisitor(ip, ua),
    device: classifyDevice(ua),
    country: detectCountry(request.headers),
  });

  return NextResponse.json({ ok: true });
}
