"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  ReadinessCategory,
  ReadinessItem,
  ReadinessReport,
  ReadinessStatus,
} from "@/lib/readiness/types";

type Props = {
  initialReport: ReadinessReport;
};

type Filter = "all" | ReadinessStatus;
type BusyAction = "refresh" | "links" | null;
type GateState = "checking" | "failed" | "ready" | "verify" | "hold";

const gateVerdicts: Record<GateState, { title: string; subtitle: string }> = {
  checking: { title: "VERIFY", subtitle: "CHECKING · DO NOT SHARE" },
  failed: { title: "CHECK FAILED", subtitle: "HOLD · RETRY REQUIRED" },
  ready: { title: "READY", subtitle: "TO SHARE" },
  verify: { title: "VERIFY", subtitle: "RUN LINK CHECK" },
  hold: { title: "HOLD", subtitle: "FIX BEFORE SHARING" },
};

const categories: Array<{
  id: ReadinessCategory;
  label: string;
  code: string;
  description: string;
}> = [
  {
    id: "identity",
    label: "身份与联系",
    code: "ID",
    description: "让面试官一眼确认你是谁、做什么，以及如何联系你。",
  },
  {
    id: "portfolio",
    label: "项目证据",
    code: "CASE",
    description: "项目不只陈述做过什么，还要给出角色、判断、结果与可验证材料。",
  },
  {
    id: "experience",
    label: "经历与方向",
    code: "XP",
    description: "职业轨迹和能力方向应当真实、具体，并与目标岗位相互印证。",
  },
  {
    id: "content",
    label: "公开内容",
    code: "CONTENT",
    description: "文章与公开页面共同决定站点是否像一个持续维护的个人空间。",
  },
  {
    id: "deployment",
    label: "上线配置",
    code: "SHIP",
    description: "域名、部署和存储设置需要符合真实公开环境，而不是本地演示。",
  },
  {
    id: "knowledge",
    label: "知识库",
    code: "KB",
    description: "若启用问答能力，知识来源和服务配置必须完整且可解释。",
  },
  {
    id: "links",
    label: "外部链接",
    code: "LINK",
    description: "仓库、演示和社交入口应当安全可达，不把面试官送到失效页面。",
  },
];

const statusMeta: Record<
  ReadinessStatus,
  { label: string; symbol: string; badge: string; border: string }
> = {
  blocker: {
    label: "阻塞",
    symbol: "×",
    badge: "border-danger/40 bg-danger/10 text-danger",
    border: "border-danger/35",
  },
  warning: {
    label: "提醒",
    symbol: "!",
    badge: "border-warn/40 bg-warn/10 text-warn",
    border: "border-warn/30",
  },
  pass: {
    label: "通过",
    symbol: "✓",
    badge: "border-accent-2/40 bg-accent-2/10 text-accent-2",
    border: "border-line",
  },
};

const statusOrder: Record<ReadinessStatus, number> = {
  blocker: 0,
  warning: 1,
  pass: 2,
};

function extractReport(payload: unknown): ReadinessReport | null {
  if (!payload || typeof payload !== "object") return null;
  const value = "report" in payload ? (payload as { report?: unknown }).report : payload;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ReadinessReport>;
  if (
    typeof candidate.generatedAt !== "string" ||
    typeof candidate.score !== "number" ||
    typeof candidate.readyToShare !== "boolean" ||
    !candidate.counts ||
    !Array.isArray(candidate.items)
  ) {
    return null;
  }
  return value as ReadinessReport;
}

function errorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

function formatScanTime(value: string) {
  return value.replace("T", " ").replace(/(?:\.\d+)?Z$/, " UTC");
}

function filterCount(report: ReadinessReport, filter: Filter) {
  return filter === "all" ? report.items.length : report.counts[filter];
}

function safeExternalHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveReadinessGateState({
  busy,
  error,
  report,
}: {
  busy: BusyAction;
  error: string | null;
  report: ReadinessReport;
}): GateState {
  if (busy !== null) return "checking";
  if (error !== null) return "failed";
  if (report.readyToShare) return "ready";
  if (report.counts.blocker === 0 && report.linkChecks === undefined) return "verify";
  return "hold";
}

export function canExportReadinessReport(busy: BusyAction, error: string | null) {
  return busy === null && error === null;
}

function ReadinessItemCard({ item }: { item: ReadinessItem }) {
  const meta = statusMeta[item.status];

  return (
    <li className={`rounded-xl border bg-bg-elevated p-4 sm:p-5 ${meta.border}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] ${meta.badge}`}
            >
              <span aria-hidden="true">{meta.symbol}</span>
              {meta.label}
            </span>
            {item.subject ? (
              <span className="max-w-full truncate font-mono text-[0.68rem] text-ink-faint">
                {item.subject}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-ink">
            {item.title}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{item.detail}</p>
        </div>
        {item.action ? (
          <Link
            href={item.action.href}
            aria-label={`${item.action.label}：${item.title}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-bg-soft px-3 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
          >
            {item.action.label}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
      <div className="mt-4 border-t border-line/70 pt-2 font-mono text-[0.64rem] uppercase tracking-[0.12em] text-ink-faint">
        check / {item.id}
      </div>
    </li>
  );
}

export function ReadinessDashboard({ initialReport }: Props) {
  const [report, setReport] = useState(initialReport);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gateState = resolveReadinessGateState({ busy, error, report });
  const verdict = gateVerdicts[gateState];
  const exportAllowed = canExportReadinessReport(busy, error);

  const visibleGroups = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          items: report.items
            .filter(
              (item) =>
                item.category === category.id && (filter === "all" || item.status === filter),
            )
            .sort((left, right) => statusOrder[left.status] - statusOrder[right.status]),
          total: report.items.filter((item) => item.category === category.id).length,
        }))
        .filter((category) => category.items.length > 0),
    [filter, report.items],
  );

  async function runCheck(action: Exclude<BusyAction, null>) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/readiness", {
        method: action === "links" ? "POST" : "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          errorMessage(payload, action === "links" ? "公开入口验证失败" : "重新检查失败"),
        );
      }
      const nextReport = extractReport(payload);
      if (!nextReport) throw new Error("体检接口返回了无法识别的报告");
      setReport(nextReport);
      setNotice(
        action === "links"
          ? `公开入口与知识服务验证完成，共检查 ${nextReport.linkChecks?.length ?? 0} 个地址。`
          : "本地发布体检已更新。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "检查失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }

  function exportReport() {
    if (!exportAllowed) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = report.generatedAt.slice(0, 10) || "latest";
    anchor.href = objectUrl;
    anchor.download = `isme-readiness-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setNotice("体检报告已导出为 JSON。");
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "blocker", label: "阻塞" },
    { id: "warning", label: "提醒" },
    { id: "pass", label: "通过" },
  ];

  const verdictCopy =
    gateState === "checking"
      ? busy === "links"
        ? "正在验证公开页面、外部链接与知识服务。在检查结束前，发布闸门保持关闭。"
        : "正在重新核对内容与上线配置。在检查结束前，发布闸门保持关闭。"
      : gateState === "failed"
        ? "检查没有完成。当前分数和清单来自上一次成功扫描，不可作为发布依据；请重新检查。"
        : gateState === "ready"
          ? report.counts.warning > 0
            ? `已可分享；仍有 ${report.counts.warning} 条优化建议，可在投递前继续完善。`
            : "关键检查全部通过，可以进入最终人工复核。"
          : gateState === "verify"
            ? "本地内容与配置没有硬阻塞。运行一次公开入口验证，确认面试官能打开关键页面、外部链接与知识服务。"
            : `还有 ${report.counts.blocker} 个阻塞项。先解决它们，再把站点链接交给面试官。`;

  return (
    <div className="space-y-8" aria-busy={busy !== null}>
      <section
        className={`readiness-gate ${
          gateState === "ready"
            ? "readiness-gate-ready"
            : gateState === "checking" || gateState === "verify"
              ? "readiness-gate-pending"
              : "readiness-gate-hold"
        }`}
        aria-labelledby="readiness-title"
      >
        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
              <span>Release gate</span>
              <span aria-hidden="true">/</span>
              <span>Résumé edition</span>
            </div>
            <h1 id="readiness-title" className="readiness-verdict mt-7 font-display">
              {verdict.title}
              <span>{verdict.subtitle}</span>
            </h1>
            <p className="mt-7 max-w-2xl text-sm leading-6 text-ink-muted sm:text-base">
              {verdictCopy}
            </p>
          </div>

          <div className="border-l-2 border-current pl-5 text-ink-muted lg:pb-1">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-ink-faint">
              {gateState === "checking" || gateState === "failed"
                ? "Last successful scan"
                : "Evidence coverage"}
            </span>
            <div className="mt-2 flex items-end gap-2">
              <strong className="font-display text-5xl leading-none text-ink">{report.score}</strong>
              <span className="pb-1 font-mono text-xs text-ink-faint">/ 100</span>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
              <div>
                <dt className="font-mono text-[0.62rem] uppercase text-ink-faint">阻塞</dt>
                <dd className="mt-1 font-display text-lg text-danger">{report.counts.blocker}</dd>
              </div>
              <div>
                <dt className="font-mono text-[0.62rem] uppercase text-ink-faint">提醒</dt>
                <dd className="mt-1 font-display text-lg text-warn">{report.counts.warning}</dd>
              </div>
              <div>
                <dt className="font-mono text-[0.62rem] uppercase text-ink-faint">通过</dt>
                <dd className="mt-1 font-display text-lg text-accent-2">{report.counts.pass}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="relative z-10 mt-9 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => void runCheck("refresh")}
          >
            {busy === "refresh" ? "正在重新检查…" : "重新检查"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy !== null}
            onClick={() => void runCheck("links")}
          >
            {busy === "links" ? "正在验证入口…" : "验证公开入口"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!exportAllowed}
            onClick={exportReport}
          >
            {exportAllowed ? "导出 JSON" : "导出已暂停"}
          </button>
          <span className="ml-auto font-mono text-[0.68rem] text-ink-faint">
            {gateState === "checking" || gateState === "failed" ? "上次成功扫描于 " : "扫描于 "}
            <time dateTime={report.generatedAt}>{formatScanTime(report.generatedAt)}</time>
          </span>
        </div>
      </section>

      <div className="min-h-6" aria-live="polite" aria-atomic="true">
        {busy ? (
          <p className="text-sm text-warn" role="status">
            {busy === "links" ? "正在验证公开入口与知识服务…" : "正在重新生成发布报告…"}
          </p>
        ) : error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : notice ? (
          <p className="text-sm text-accent-2" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="release-checklist-title">
        <div className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-accent">
              Ordered review
            </p>
            <h2 id="release-checklist-title" className="mt-2 font-display text-2xl text-ink sm:text-3xl">
              发布清单
            </h2>
            <p className="mt-2 text-sm text-ink-muted">阻塞项优先；每条修复入口都指向对应后台页面。</p>
          </div>
          <div
            role="group"
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-bg-elevated p-1"
            aria-label="筛选体检结果"
          >
            {filters.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${
                  filter === option.id
                    ? "bg-accent text-[var(--btn-on-accent)]"
                    : "text-ink-muted hover:bg-bg-soft hover:text-ink"
                }`}
                onClick={() => setFilter(option.id)}
              >
                {option.label} {filterCount(report, option.id)}
              </button>
            ))}
          </div>
        </div>

        {visibleGroups.length > 0 ? (
          <div className="readiness-release-spine mt-7">
            {visibleGroups.map((category) => {
              const blockerCount = category.items.filter((item) => item.status === "blocker").length;
              return (
                <section key={category.id} className="readiness-checkpoint" aria-labelledby={`category-${category.id}`}>
                  <span className="readiness-checkpoint-marker" aria-hidden="true">
                    {category.code}
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 id={`category-${category.id}`} className="font-display text-xl text-ink">
                        {category.label}
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
                        {category.description}
                      </p>
                    </div>
                    <span className={`shrink-0 font-mono text-[0.68rem] ${blockerCount ? "text-danger" : "text-ink-faint"}`}>
                      {blockerCount ? `${blockerCount} blocker` : `${category.total} checks`}
                    </span>
                  </div>
                  <ul className="mt-4 grid gap-3">
                    {category.items.map((item) => (
                      <ReadinessItemCard key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-7 rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">
            当前筛选下没有检查项。切换到“全部”查看完整报告。
          </div>
        )}
      </section>

      {report.linkChecks !== undefined ? (
        <section className="border-t border-line pt-8" aria-labelledby="link-checks-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-accent">
                Live verification
              </p>
              <h2 id="link-checks-title" className="mt-2 font-display text-2xl text-ink">
                外链实测
              </h2>
            </div>
            <span className="font-mono text-xs text-ink-faint">
              {report.linkChecks.length} / {report.linkTargetCount ?? report.linkChecks.length} URLs
            </span>
          </div>
          {report.linkChecks.length > 0 ? (
            <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-bg-elevated">
              {report.linkChecks.map((check, index) => {
                const ok = check.status === "ok";
                const href = check.status === "ok" ? safeExternalHref(check.url) : null;
                return (
                  <li key={`${check.source}:${check.url}:${index}`} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-mono text-xs font-bold ${ok ? "text-accent-2" : check.status === "blocked" ? "text-warn" : "text-danger"}`}>
                          {ok ? "✓ 可达" : check.status === "blocked" ? "! 已拦截" : check.status === "skipped" ? "— 已跳过" : "× 失败"}
                        </span>
                        <span className="text-sm font-semibold text-ink">{check.label}</span>
                        <span className="font-mono text-[0.66rem] text-ink-faint">{check.source}</span>
                      </div>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          referrerPolicy="no-referrer"
                          className="mt-2 block break-all font-mono text-xs text-ink-muted underline decoration-line underline-offset-4 hover:text-accent"
                        >
                          {check.url}
                        </a>
                      ) : (
                        <span className="mt-2 block break-all font-mono text-xs text-ink-muted">
                          {check.url}
                        </span>
                      )}
                      {check.detail ? <p className="mt-2 text-xs text-ink-faint">{check.detail}</p> : null}
                    </div>
                    <div className="flex gap-3 font-mono text-[0.68rem] text-ink-faint sm:justify-end">
                      {check.httpStatus ? <span>HTTP {check.httpStatus}</span> : null}
                      {typeof check.latencyMs === "number" ? <span>{check.latencyMs} ms</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm text-ink-muted">
              没有可检查的外部地址。先在资料或项目中添加真实链接。
            </p>
          )}
        </section>
      ) : null}

      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-accent hover:text-ink">
        ← 返回概览
      </Link>
    </div>
  );
}
