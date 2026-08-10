import { NextResponse } from "next/server";
import { getInsightsBundle } from "@/lib/analytics/chat-events";
import { getTrafficBundle } from "@/lib/analytics/page-views";
import { parseInsightsRange } from "@/lib/analytics/range";
import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const range = parseInsightsRange(new URL(request.url).searchParams.get("range"));
  const traffic = getTrafficBundle(range);
  const insights = getInsightsBundle(range);

  const sections: string[] = [];
  sections.push(`# insights export range=${range}`);
  sections.push(
    toCsv(
      ["metric", "value"],
      [
        ["pageviews", traffic.stats.totalViews],
        ["visitors", traffic.stats.uniqueVisitors],
        ["questions", insights.stats.totalQuestions],
        ["demo_questions", insights.stats.demoQuestions],
        ["thumbs_up", insights.feedback.thumbsUp],
        ["thumbs_down", insights.feedback.thumbsDown],
      ],
    ),
  );
  sections.push(
    toCsv(
      ["day", "views"],
      traffic.dailyViews.map((r) => [r.day, r.count]),
    ),
  );
  sections.push(
    toCsv(
      ["day", "questions"],
      insights.dailyQuestions.map((r) => [r.day, r.count]),
    ),
  );
  sections.push(
    toCsv(
      ["path", "views", "last_seen"],
      traffic.topPaths.map((r) => [r.path, r.count, r.lastSeenAt]),
    ),
  );
  sections.push(
    toCsv(
      ["content_path", "views", "last_seen"],
      traffic.topContent.map((r) => [r.path, r.count, r.lastSeenAt]),
    ),
  );
  sections.push(
    toCsv(
      ["query", "module", "count", "last_asked"],
      insights.hotQuestions.map((r) => [r.query, r.moduleSlug, r.count, r.lastAskedAt]),
    ),
  );

  return new NextResponse(sections.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="isme-insights-${range}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
