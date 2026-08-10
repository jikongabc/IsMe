import Link from "next/link";
import { redirect } from "next/navigation";
import { SparkBars } from "@/components/admin/SparkBars";
import { getInsightsBundle } from "@/lib/analytics/chat-events";
import { getTrafficBundle } from "@/lib/analytics/page-views";
import { parseInsightsRange, type InsightsRange } from "@/lib/analytics/range";
import { isAdminAuthenticated } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const RANGES: InsightsRange[] = ["7d", "30d", "90d", "all"];

export default async function AdminInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");

  const params = await searchParams;
  const range = parseInsightsRange(params.range);
  const insights = getInsightsBundle(range);
  const traffic = getTrafficBundle(range);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">insights</h1>
          <p className="mt-2 text-sm text-ink-muted">
            traffic trends · content performance · question heat · local sqlite
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin/insights?range=${r}`}
              className={
                r === range
                  ? "btn-primary px-3 py-1 text-xs"
                  : "btn-ghost px-3 py-1 text-xs"
              }
            >
              {r}
            </Link>
          ))}
          <a
            href={`/api/admin/insights/export?range=${range}`}
            className="btn-ghost px-3 py-1 text-xs"
          >
            export csv
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="pageviews" value={String(traffic.stats.totalViews)} />
        <Stat label="visitors" value={String(traffic.stats.uniqueVisitors)} />
        <Stat label="questions" value={String(insights.stats.totalQuestions)} />
        <Stat label="demo asks" value={String(insights.stats.demoQuestions)} />
        <Stat label="thumbs up" value={String(insights.feedback.thumbsUp)} />
        <Stat label="thumbs down" value={String(insights.feedback.thumbsDown)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="terminal-window p-5">
          <SparkBars series={traffic.dailyViews} label="views / day" />
        </section>
        <section className="terminal-window p-5">
          <SparkBars series={insights.dailyQuestions} label="questions / day" />
        </section>
      </div>

      <section className="terminal-window p-5">
        <h2 className="font-display text-xl text-accent">content performance</h2>
        <p className="mt-1 text-xs text-ink-faint">/blog/* and /projects/* in range</p>
        {traffic.topContent.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted"># no content hits in this range</p>
        ) : (
          <ol className="mt-4 space-y-2 text-sm">
            {traffic.topContent.map((row, index) => (
              <li
                key={row.path}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2"
              >
                <span className="text-ink">
                  <span className="text-ink-faint">{index + 1}.</span> {row.path}
                </span>
                <span className="font-mono text-xs text-ink-faint">
                  x{row.count} · {row.lastSeenAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="terminal-window p-5">
        <h2 className="font-display text-xl text-accent">top pages</h2>
        <p className="mt-1 text-xs text-ink-faint">hashed visitors · admin/api paths ignored</p>
        {traffic.topPaths.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted"># no pageviews yet — browse the public site</p>
        ) : (
          <ol className="mt-4 space-y-2 text-sm">
            {traffic.topPaths.map((row, index) => (
              <li
                key={row.path}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2"
              >
                <span className="text-ink">
                  <span className="text-ink-faint">{index + 1}.</span> {row.path}
                </span>
                <span className="font-mono text-xs text-ink-faint">
                  x{row.count} · {row.lastSeenAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="terminal-window p-5">
        <h2 className="font-display text-xl text-accent">referrers</h2>
        {traffic.topReferrers.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted"># no referrers yet</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {traffic.topReferrers.map((row) => (
              <li key={row.referrer} className="flex justify-between gap-3">
                <span className="truncate text-ink">{row.referrer}</span>
                <span className="font-mono text-ink-faint">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="terminal-window p-5">
          <h2 className="font-display text-xl text-accent">devices</h2>
          <p className="mt-1 text-xs text-ink-faint">from user-agent · no third-party tracker</p>
          {traffic.topDevices.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted"># no device data</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {traffic.topDevices.map((row) => (
                <li key={row.device} className="flex justify-between gap-3">
                  <span className="text-ink">{row.device}</span>
                  <span className="font-mono text-ink-faint">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="terminal-window p-5">
          <h2 className="font-display text-xl text-accent">countries</h2>
          <p className="mt-1 text-xs text-ink-faint">
            CF-IPCountry / Vercel / CloudFront headers · local = (unknown)
          </p>
          {traffic.topCountries.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted"># no country data</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {traffic.topCountries.map((row) => (
                <li key={row.country} className="flex justify-between gap-3">
                  <span className="text-ink">{row.country}</span>
                  <span className="font-mono text-ink-faint">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="terminal-window p-5">
        <h2 className="font-display text-xl text-accent">hot questions</h2>
        <p className="mt-1 text-xs text-ink-faint">normalized + ranked by ask count</p>
        {insights.hotQuestions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted"># no questions yet — ask on /knowledge</p>
        ) : (
          <ol className="mt-4 space-y-2 text-sm">
            {insights.hotQuestions.map((row, index) => (
              <li
                key={`${row.queryNormalized}:${row.moduleSlug}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2"
              >
                <span className="text-ink">
                  <span className="text-ink-faint">{index + 1}.</span> {row.query}
                </span>
                <span className="font-mono text-xs text-ink-faint">
                  x{row.count} · {row.moduleSlug} · {row.lastAskedAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="terminal-window p-5">
        <h2 className="font-display text-xl text-accent">by module</h2>
        {insights.stats.byModule.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted"># idle</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {insights.stats.byModule.map((row) => (
              <li key={row.moduleSlug} className="flex justify-between gap-3">
                <span className="text-ink">{row.moduleSlug}</span>
                <span className="font-mono text-ink-faint">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="terminal-window p-5">
        <h2 className="font-display text-xl text-accent">recent questions</h2>
        {insights.recent.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted"># empty log</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {insights.recent.map((row) => (
              <li key={row.id} className="border-b border-line/60 pb-2">
                <div className="text-ink">{row.query}</div>
                <div className="mt-1 font-mono text-xs text-ink-faint">
                  {row.moduleSlug}
                  {row.demo ? " · demo" : ""}
                  {row.traceId ? ` · ${row.traceId.slice(0, 12)}` : ""}
                  {" · "}
                  {row.createdAt.replace("T", " ").slice(0, 19)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/admin" className="text-sm text-accent">
        ← overview
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="terminal-window p-4">
      <div className="text-xs text-ink-faint">./{label}</div>
      <div className="mt-2 font-display text-2xl text-ink">{value}</div>
    </div>
  );
}
