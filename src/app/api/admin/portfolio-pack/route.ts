import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { privateNoStore } from "@/lib/http/admin-request";
import { readCurrentPortfolioPack } from "@/lib/portfolio-pack/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return privateNoStore(denied);

  try {
    const pack = readCurrentPortfolioPack();
    const day = pack.exportedAt.slice(0, 10);
    return privateNoStore(new NextResponse(JSON.stringify(pack, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="portfolio-pack-${day}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    }));
  } catch (error) {
    console.error("portfolio pack export failed", error);
    return privateNoStore(NextResponse.json(
      { error: "当前内容包无法导出；请先修复后台内容校验错误。" },
      { status: 500 },
    ));
  }
}
