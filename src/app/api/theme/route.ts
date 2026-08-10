import { NextResponse } from "next/server";
import { getSiteAppearance } from "@/lib/content/queries";
import { THEME_COOKIE } from "@/lib/theme";
import { visitorThemeSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = visitorThemeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
  }

  const { themeConfig } = await getSiteAppearance();
  if (!themeConfig.enabledThemes.includes(parsed.data.theme)) {
    return NextResponse.json(
      { error: "Theme is disabled for this site", code: "THEME_DISABLED" },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true, theme: parsed.data.theme });
  response.cookies.set(THEME_COOKIE, parsed.data.theme, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
