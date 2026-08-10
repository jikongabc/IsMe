import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { privateNoStore } from "@/lib/http/admin-request";
import {
  PORTFOLIO_BUNDLE_MAX_FILE_BYTES,
} from "@/lib/portfolio-bundle";
import {
  createPortfolioBundle,
  PortfolioBundleExportError,
} from "@/lib/portfolio-bundle/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return privateNoStore(denied);

  try {
    const bundle = await createPortfolioBundle();
    const body = JSON.stringify(bundle);
    if (Buffer.byteLength(body) > PORTFOLIO_BUNDLE_MAX_FILE_BYTES) {
      throw new PortfolioBundleExportError("站点包超过导出上限。");
    }
    const day = bundle.exportedAt.slice(0, 10);
    return privateNoStore(new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="portfolio-bundle-${day}.isme.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    }));
  } catch (error) {
    if (!(error instanceof PortfolioBundleExportError)) {
      console.error("portfolio bundle export failed", error);
    }
    return privateNoStore(NextResponse.json(
      {
        error: error instanceof PortfolioBundleExportError
          ? error.message
          : "无法读取受管媒体，未生成自包含站点包。",
      },
      { status: 500 },
    ));
  }
}
