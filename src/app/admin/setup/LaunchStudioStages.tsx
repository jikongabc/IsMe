import Link from "next/link";
import type { RefObject } from "react";
import type { ReadinessSummary, ReviewPlan, SetupSnapshot } from "./models";
import {
  MAX_PORTFOLIO_BUNDLE_BYTES,
  MAX_PORTFOLIO_PACK_BYTES,
  portfolioSections,
  type ParsedPackDraft,
  type PortfolioSectionKey,
} from "./state";

export type BusyAction =
  | "download"
  | "bundle-download"
  | "preview"
  | "import"
  | "demo-preview"
  | "demo-cleanup"
  | null;

function sectionMeta(key: PortfolioSectionKey) {
  return portfolioSections.find((section) => section.key === key) ?? portfolioSections[0];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function PlanLedger({ plan, title }: { plan: ReviewPlan; title: string }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">
            Dry run manifest
          </p>
          <h3 className="mt-1 font-display text-xl text-ink">{title}</h3>
        </div>
        {plan.blockers.length > 0 ? (
          <span className="font-mono text-xs text-danger">INTERLOCKED</span>
        ) : (
          <span className="font-mono text-xs text-accent-2">REVIEWABLE</span>
        )}
      </div>

      <div
        className="overflow-x-auto rounded-xl border border-line"
        role="region"
        aria-label="栏目导入差异，可横向滚动"
        tabIndex={0}
      >
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="bg-bg-soft font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
            <tr>
              <th className="px-4 py-3 font-medium">栏目</th>
              <th className="px-3 py-3 text-right font-medium">当前</th>
              <th className="px-3 py-3 text-right font-medium">导入</th>
              <th className="px-3 py-3 text-right font-medium">新增</th>
              <th className="px-3 py-3 text-right font-medium">替换</th>
              <th className="px-4 py-3 text-right font-medium">移除</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-bg-elevated text-ink-muted">
            {plan.sections.map((section) => (
              <tr key={section.key}>
                <th className="px-4 py-3 font-medium text-ink">{sectionMeta(section.key).label}</th>
                <td className="px-3 py-3 text-right font-mono">{section.current}</td>
                <td className="px-3 py-3 text-right font-mono">{section.incoming}</td>
                <td className="px-3 py-3 text-right font-mono text-accent-2">+{section.added}</td>
                <td className="px-3 py-3 text-right font-mono text-warn">~{section.replaced}</td>
                <td className="px-4 py-3 text-right font-mono text-danger">−{section.removed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.sections.some((section) => section.selected && section.changes.length > 0) ? (
        <section aria-labelledby="plan-change-manifest-title">
          <h4 id="plan-change-manifest-title" className="font-display text-lg text-ink">
            逐项变更清单
          </h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {plan.sections
              .filter((section) => section.selected && section.changes.length > 0)
              .map((section) => (
                <div key={section.key} className="rounded-xl border border-line bg-bg-soft p-4">
                  <h5 className="font-semibold text-ink">{sectionMeta(section.key).label}</h5>
                  <ul className="mt-2 space-y-2 text-sm leading-5 text-ink-muted">
                    {section.changes.map((change, index) => (
                      <li key={`${change.action}:${change.key}:${index}`} className="flex gap-2">
                        <span className={`font-mono text-[0.66rem] ${change.action === "remove" ? "text-danger" : change.action === "replace" ? "text-warn" : "text-accent-2"}`}>
                          {change.action === "remove" ? "REMOVE" : change.action === "replace" ? "REPLACE" : "ADD"}
                        </span>
                        <span>
                          <span className="block [overflow-wrap:anywhere]">
                            {change.label}
                            {change.fields && change.fields.length > 0
                              ? ` · ${change.fields.join("、")}`
                              : ""}
                          </span>
                          {change.from !== undefined || change.to !== undefined ? (
                            <span className="mt-1 block [overflow-wrap:anywhere] font-mono text-[0.68rem] text-ink-faint">
                              {change.from || "∅"} → {change.to || "∅"}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {section.changesTruncated ? (
                    <p className="mt-3 font-mono text-[0.66rem] text-warn">清单已截断，请同时核对上方汇总数量。</p>
                  ) : null}
                </div>
              ))}
          </div>
        </section>
      ) : null}

      {plan.blockers.length > 0 ? (
        <section className="rounded-xl border border-danger/40 bg-danger/10 p-4" aria-labelledby="plan-blockers-title">
          <h4 id="plan-blockers-title" className="font-semibold text-danger">
            应用仍被阻止
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-muted">
            {plan.blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      {plan.bundle ? (
        <section className="rounded-xl border border-accent-2/40 bg-accent-2/5 p-4" aria-labelledby="plan-media-title">
          <h4 id="plan-media-title" className="font-semibold text-accent-2">
            {plan.bundle.importedAssetCount} 个受管图片将随栏目迁移
          </h4>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            已内嵌 {formatBytes(plan.bundle.importedBytes)}，应用前会复核 Base64、图片魔数与 SHA-256。
            {plan.bundle.externalReferenceCount > 0
              ? ` 另有 ${plan.bundle.externalReferenceCount} 个外部图片地址保持为 URL 引用。`
              : " 所选栏目的受管图片不需要再手工搬运。"}
          </p>
        </section>
      ) : plan.mediaReferenceCount > 0 || plan.mediaReferencesTruncated ? (
          <section className="rounded-xl border border-warn/45 bg-warn/10 p-4" aria-labelledby="plan-media-title">
            <h4 id="plan-media-title" className="font-semibold text-warn">
              {plan.mediaReferenceCount > 0
                ? `${plan.mediaReferenceCount} 个媒体引用需要另行迁移`
                : "媒体引用清单达到扫描上限"}
              {plan.mediaReferencesTruncated ? "（清单已截断）" : ""}
            </h4>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              portfolio-pack.v1 只保存媒体 URL，不包含 /uploads 文件字节。换机器时还需单独搬运 uploads 目录或对应 S3 对象。
            </p>
          </section>
        ) : null}

      {plan.warnings.length > 0 || plan.publicationAdjustments.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {plan.warnings.length > 0 ? (
            <section className="rounded-xl border border-warn/35 bg-warn/10 p-4" aria-labelledby="plan-warnings-title">
              <h4 id="plan-warnings-title" className="font-semibold text-warn">需要留意</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-muted">
                {plan.warnings.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ) : null}
          {plan.publicationAdjustments.length > 0 ? (
            <section className="rounded-xl border border-line bg-bg-soft p-4" aria-labelledby="publication-adjustments-title">
              <h4 id="publication-adjustments-title" className="font-semibold text-ink">发布状态调整</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-muted">
                {plan.publicationAdjustments.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-xs text-ink-faint">
        <span>media refs / {plan.mediaReferenceCount}</span>
        {plan.readinessBefore && plan.readinessAfter ? (
          <span>
            readiness / {plan.readinessBefore.score} → {plan.readinessAfter.score}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type StageHeadingRef = RefObject<HTMLHeadingElement | null>;

export function InventoryStage({
  headingRef,
  snapshot,
  readiness,
  busy,
  demoPlan,
  demoConfirmed,
  demoRemoved,
  onDemoConfirmed,
  onPreviewDemo,
  onCleanupDemo,
  onContinue,
}: {
  headingRef: StageHeadingRef;
  snapshot: SetupSnapshot;
  readiness: ReadinessSummary;
  busy: BusyAction;
  demoPlan: ReviewPlan | null;
  demoConfirmed: boolean;
  demoRemoved: boolean;
  onDemoConfirmed(value: boolean): void;
  onPreviewDemo(): void;
  onCleanupDemo(): void;
  onContinue(): void;
}) {
  const actionable = readiness.items
    .filter((item) => item.status !== "pass")
    .slice(0, 4);

  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">Stage 01 / inventory</p>
      <h2 ref={headingRef} tabIndex={-1} id="launch-stage-inventory" className="mt-2 font-display text-3xl text-ink outline-none">
        先确认这座站里已经有什么
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
        这里只展示栏目数量和 demo/真实内容边界，不把完整内容包或内部配置发送到浏览器。
      </p>

      <section className="mt-7" aria-labelledby="inventory-manifest-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
          <h3 id="inventory-manifest-title" className="font-display text-xl text-ink">当前内容清单</h3>
          <span className="font-mono text-xs text-ink-faint">{snapshot.totalCount} records</span>
        </div>
        <ul className="divide-y divide-line">
          {snapshot.sections.map((section) => {
            const meta = sectionMeta(section.key);
            return (
              <li key={section.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <span className="font-semibold text-ink">{meta.label}</span>
                  <span className="ml-2 text-xs text-ink-faint">{meta.description}</span>
                </div>
                <div className="flex gap-3 font-mono text-xs text-ink-faint sm:justify-end">
                  <span>{section.count} total</span>
                  {section.demoCount > 0 ? <span className="text-warn">{section.demoCount} demo</span> : null}
                  {section.realCount > 0 ? <span className="text-accent-2">{section.realCount} real</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-7 rounded-xl border border-line bg-bg-soft p-4 sm:p-5" aria-labelledby="inventory-readiness-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="inventory-readiness-title" className="font-display text-xl text-ink">当前发布状态</h3>
          <span className={`font-mono text-xs ${readiness.counts.blocker ? "text-danger" : "text-accent-2"}`}>
            {readiness.score}/100 · {readiness.counts.blocker} blocker
          </span>
        </div>
        {actionable.length > 0 ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {actionable.map((item) => (
              <li key={item.id} className="rounded-lg border border-line bg-bg-elevated p-3 text-sm">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 font-mono text-xs ${item.status === "blocker" ? "text-danger" : "text-warn"}`}>
                    {item.status === "blocker" ? "BLOCK" : "WARN"}
                  </span>
                  <span className="text-ink-muted">{item.title}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">当前没有待处理的发布项。</p>
        )}
      </section>

      <section className="mt-7 rounded-xl border border-warn/35 bg-warn/5 p-4 sm:p-5" aria-labelledby="demo-cleanup-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="demo-cleanup-title" className="font-display text-xl text-ink">Demo 内容清理互锁</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
              清理只作用于服务端能明确识别的 seed 内容。必须先看清单，再单独确认；预览请求不会写入数据库。
            </p>
          </div>
          <span className={`font-mono text-xs ${demoRemoved ? "text-accent-2" : snapshot.hasDemoContent ? "text-warn" : "text-ink-faint"}`}>
            {demoRemoved ? "CLEARED" : snapshot.hasDemoContent ? "DEMO DETECTED" : "NO DEMO FOUND"}
          </span>
        </div>

        {demoPlan ? (
          <div className="mt-5 space-y-5">
            <PlanLedger plan={demoPlan} title="拟清理清单" />
            <label className="flex items-start gap-3 rounded-lg border border-line bg-bg-elevated p-3 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="mt-1"
                checked={demoConfirmed}
                onChange={(event) => onDemoConfirmed(event.target.checked)}
              />
              <span>我已核对清单，确认只移除以上可识别 demo 内容。真实内容不得被默认清理。</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="border border-danger px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
                disabled={!demoConfirmed || demoPlan.blockers.length > 0 || busy !== null}
                onClick={onCleanupDemo}
              >
                {busy === "demo-cleanup" ? "正在原子清理…" : "确认清理 demo"}
              </button>
              <button type="button" className="btn-ghost" disabled={busy !== null} onClick={onPreviewDemo}>
                重新生成清单
              </button>
            </div>
          </div>
        ) : snapshot.hasDemoContent && !demoRemoved ? (
          <button type="button" className="btn-ghost mt-5" disabled={busy !== null} onClick={onPreviewDemo}>
            {busy === "demo-preview" ? "正在生成清理清单…" : "预览 demo 清理范围"}
          </button>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">
            {demoRemoved ? "清理已完成；请继续导入或手动录入真实内容。" : "没有检测到需要批量清理的 demo 内容。"}
          </p>
        )}
      </section>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Link href="/admin/readiness" className="inline-flex min-h-11 items-center text-sm text-accent hover:text-ink">
          查看完整发布体检
        </Link>
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={onContinue}>
          进入内容迁移 <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

export function TransferStage({
  headingRef,
  draftText,
  draft,
  draftName,
  selectedSections,
  snapshot,
  rememberDraft,
  storageCopy,
  busy,
  onTextChange,
  onScreen,
  onFile,
  onToggleSection,
  onRememberDraft,
  onClearStored,
  onDownloadCurrent,
  onDownloadBundle,
  onDownloadStarter,
  onPreview,
}: {
  headingRef: StageHeadingRef;
  draftText: string;
  draft: ParsedPackDraft | null;
  draftName: string;
  selectedSections: PortfolioSectionKey[];
  snapshot: SetupSnapshot;
  rememberDraft: boolean;
  storageCopy: string;
  busy: BusyAction;
  onTextChange(value: string): void;
  onScreen(): boolean;
  onFile(file: File | undefined): void;
  onToggleSection(key: PortfolioSectionKey): void;
  onRememberDraft(value: boolean): void;
  onClearStored(): void;
  onDownloadCurrent(): void;
  onDownloadBundle(): void;
  onDownloadStarter(): void;
  onPreview(): void;
}) {
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">Stage 02 / transfer</p>
      <h2 ref={headingRef} tabIndex={-1} id="launch-stage-transfer" className="mt-2 font-display text-3xl text-ink outline-none">
        选择一条可回滚的迁移路径
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
        轻量内容包适合编辑与版本管理；自包含站点包会把已注册、正在使用的图片一起带走。两种格式都必须先预览再应用。
      </p>

      <div className="mt-7 grid gap-3 md:grid-cols-3">
        <button type="button" className="rounded-xl border border-line bg-bg-soft p-4 text-left transition hover:border-accent" disabled={busy !== null} onClick={onDownloadCurrent}>
          <span className="font-mono text-xs text-accent">EXPORT CURRENT</span>
          <strong className="mt-2 block font-display text-lg text-ink">下载当前内容包</strong>
          <span className="mt-1 block text-sm leading-6 text-ink-muted">用于迁移、备份或在另一实例继续编辑。</span>
        </button>
        <button type="button" className="rounded-xl border border-accent-2/35 bg-accent-2/5 p-4 text-left transition hover:border-accent-2" disabled={busy !== null} onClick={onDownloadBundle}>
          <span className="font-mono text-xs text-accent-2">EXPORT + MEDIA</span>
          <strong className="mt-2 block font-display text-lg text-ink">下载自包含站点包</strong>
          <span className="mt-1 block text-sm leading-6 text-ink-muted">把内容与受管图片装进一个带哈希的 JSON 文件。</span>
        </button>
        <button type="button" className="rounded-xl border border-line bg-bg-soft p-4 text-left transition hover:border-accent" disabled={busy !== null} onClick={onDownloadStarter}>
          <span className="font-mono text-xs text-accent-2">START BLANK</span>
          <strong className="mt-2 block font-display text-lg text-ink">下载空白模板</strong>
          <span className="mt-1 block text-sm leading-6 text-ink-muted">没有旧实例时，从完整字段结构开始填写。</span>
        </button>
      </div>

      <section className="mt-7" aria-labelledby="pack-input-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="pack-input-title" className="font-display text-xl text-ink">选择文件或粘贴 JSON</h3>
            <p id="pack-file-help" className="mt-1 text-xs text-ink-faint">普通内容包最多 {MAX_PORTFOLIO_PACK_BYTES / 1024 / 1024} MiB；自包含站点包最多 {MAX_PORTFOLIO_BUNDLE_BYTES / 1024 / 1024} MiB。浏览器只做结构初筛。</p>
          </div>
          <label className="btn-ghost focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-accent">
            选择 JSON 文件
            <input
              type="file"
              disabled={busy !== null}
              accept=".json,application/json"
              aria-describedby="pack-file-help"
              className="sr-only"
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <textarea
          disabled={busy !== null}
          value={draftText}
          onChange={(event) => onTextChange(event.target.value)}
          rows={13}
          spellCheck={false}
          aria-label="portfolio-pack.v1 或 portfolio-bundle.v1 JSON"
          placeholder={'{\n  "version": "portfolio-pack.v1",\n  "sections": { ... }\n}'}
          className="mt-4 w-full rounded-xl border border-line bg-bg-soft p-4 font-mono text-xs leading-6 text-ink outline-none focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="btn-ghost" disabled={!draftText.trim() || busy !== null} onClick={onScreen}>
            初筛 JSON
          </button>
          {draft ? (
            <span className="inline-flex min-h-11 items-center font-mono text-xs text-accent-2">
              {draftName || "草稿"} · {formatBytes(draft.bytes)} · {draft.format === "bundle" ? `${draft.assetCount} assets · BUNDLE OK` : "PACK OK"}
            </span>
          ) : null}
        </div>
      </section>

      {draft ? (
        <section className="mt-7" aria-labelledby="section-selection-title">
          <div className="border-b border-line pb-3">
            <h3 id="section-selection-title" className="font-display text-xl text-ink">选择进入差异演算的栏目</h3>
            <p className="mt-1 text-sm text-ink-muted">空栏目也是“替换为空”的有效意图。已有真实内容的目标默认不勾选。</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {draft.sections.map((key) => {
              const meta = sectionMeta(key);
              const current = snapshot.sections.find((section) => section.key === key);
              const risky = (current?.realCount ?? 0) > 0;
              return (
                <label key={key} className={`flex items-start gap-3 rounded-xl border p-4 ${risky ? "border-warn/35 bg-warn/5" : "border-line bg-bg-soft"}`}>
                  <input
                    type="checkbox"
                    disabled={busy !== null}
                    className="mt-1"
                    checked={selectedSections.includes(key)}
                    onChange={() => onToggleSection(key)}
                  />
                  <span className="min-w-0">
                    <strong className="text-ink">{meta.label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-ink-faint">{meta.description}</span>
                    {risky ? (
                      <span className="mt-2 block font-mono text-[0.66rem] text-warn">
                        {current?.realCount} 条真实内容 · opt-in overwrite
                      </span>
                    ) : (
                      <span className="mt-2 block font-mono text-[0.66rem] text-accent-2">
                        {current?.demoCount ? "demo-only destination" : "empty destination"}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl border border-line bg-bg-elevated p-4">
            <label className="flex items-start gap-3 text-sm text-ink-muted">
              <input type="checkbox" className="mt-1" disabled={busy !== null} checked={rememberDraft} onChange={(event) => onRememberDraft(event.target.checked)} />
              <span>
                <strong className="block text-ink">在这台浏览器恢复导入草稿</strong>
                内容包可能含草稿、隐藏或归档内容，并会留在此设备的 localStorage；只在可信的个人设备上主动启用。
              </span>
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <span className={`text-xs ${storageCopy.includes("不会恢复") || storageCopy.includes("无法") ? "text-warn" : "text-ink-faint"}`}>
                {storageCopy}
              </span>
              <button type="button" disabled={busy !== null} className="text-xs text-danger hover:text-ink disabled:opacity-50" onClick={onClearStored}>清除浏览器草稿</button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <span className="text-sm text-ink-muted">已选 {selectedSections.length}/{draft.sections.length} 栏；服务端预览不会写入内容。</span>
            <button type="button" className="btn-primary" disabled={selectedSections.length === 0 || busy !== null} onClick={onPreview}>
              {busy === "preview" ? "正在演算差异…" : "生成服务端差异"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : null}

      <aside className="mt-7 rounded-xl border border-dashed border-line p-4 text-sm leading-6 text-ink-muted">
        不使用内容包也可以：前往 <Link href="/admin/profile" className="text-accent">资料</Link>、<Link href="/admin/experiences" className="text-accent">经历</Link> 和 <Link href="/admin/projects" className="text-accent">项目</Link> 手动填写，进度仍由发布体检统一判断。
      </aside>
    </div>
  );
}

export function ReviewStage({
  headingRef,
  plan,
  selectedSections,
  onAdjust,
  onContinue,
}: {
  headingRef: StageHeadingRef;
  plan: ReviewPlan;
  selectedSections: PortfolioSectionKey[];
  onAdjust(): void;
  onContinue(): void;
}) {
  const recommendationDiffers =
    plan.recommendedSelection.length > 0
    && (plan.recommendedSelection.length !== selectedSections.length
      || plan.recommendedSelection.some((key) => !selectedSections.includes(key)));
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">Stage 03 / dry run</p>
      <h2 ref={headingRef} tabIndex={-1} id="launch-stage-review" className="mt-2 font-display text-3xl text-ink outline-none">
        审阅差异，不预演成假页面
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
        以下数字来自服务端校验，是应用后的栏目与就绪度投影。公开页面仍只展示当前已保存的数据。
      </p>
      <div className="mt-7">
        <PlanLedger plan={plan} title="栏目差异与发布影响" />
      </div>
      {recommendationDiffers ? (
        <div className="mt-5 rounded-xl border border-warn/35 bg-warn/10 p-4 text-sm leading-6 text-ink-muted">
          服务端推荐改为：{plan.recommendedSelection.map((key) => sectionMeta(key).label).join("、")}。返回栏目选择后重新生成预览；系统不会静默替你更改选择。
        </div>
      ) : null}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <button type="button" className="btn-ghost" onClick={onAdjust}>← 调整栏目</button>
        <button type="button" className="btn-primary" disabled={plan.blockers.length > 0} onClick={onContinue}>
          {plan.blockers.length > 0 ? "先处理预览阻断" : "进入原子应用"} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

export function ApplyStage({
  headingRef,
  plan,
  selectedSections,
  confirmed,
  busy,
  onConfirmed,
  onBack,
  onApply,
}: {
  headingRef: StageHeadingRef;
  plan: ReviewPlan;
  selectedSections: PortfolioSectionKey[];
  confirmed: boolean;
  busy: BusyAction;
  onConfirmed(value: boolean): void;
  onBack(): void;
  onApply(): void;
}) {
  const destructive = plan.sections.filter((section) => section.replaced > 0 || section.removed > 0);
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">Stage 04 / atomic apply</p>
      <h2 ref={headingRef} tabIndex={-1} id="launch-stage-apply" className="mt-2 font-display text-3xl text-ink outline-none">
        最后一次互锁确认
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
        所选栏目会在一次数据库事务中应用；任一栏目校验失败，整次导入都不会落库。
        {plan.bundle
          ? " 受管图片使用内容摘要稳定文件名先行写入；数据库提交失败时会尽力回收本次新登记的媒体。"
          : ""}
      </p>

      <div className="mt-7 rounded-xl border border-line bg-bg-soft p-4 sm:p-5">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-ink-faint">Selected sections</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {selectedSections.map((key) => (
            <li key={key} className="rounded-full border border-line bg-bg-elevated px-3 py-1.5 text-sm text-ink">
              {sectionMeta(key).label}
            </li>
          ))}
        </ul>
        {destructive.length > 0 ? (
          <div className="mt-5 border-t border-warn/30 pt-4">
            <p className="font-semibold text-warn">包含替换或移除</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {destructive.map((section) => (
                <li key={section.key}>
                  {sectionMeta(section.key).label}：替换 {section.replaced}，移除 {section.removed}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-xl border border-danger/35 bg-danger/5 p-4 text-sm leading-6 text-ink-muted">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} />
        <span>
          <strong className="block text-ink">我已审阅服务端差异，并确认原子应用以上栏目</strong>
          未勾选的栏目保持原样；知识库内部绑定和启用状态不会从内容包导入。
        </span>
      </label>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <button type="button" className="btn-ghost" disabled={busy !== null} onClick={onBack}>← 返回差异</button>
        <button type="button" className="border border-danger bg-danger px-4 py-3 font-semibold text-[var(--btn-on-accent)] transition hover:bg-danger/90 disabled:opacity-50" disabled={!confirmed || busy !== null} onClick={onApply}>
          {busy === "import" ? "正在原子应用…" : "应用所选栏目"}
        </button>
      </div>
    </div>
  );
}

export function ReleaseStage({
  headingRef,
  readiness,
  readinessUnavailable,
  syncQueued,
}: {
  headingRef: StageHeadingRef;
  readiness: ReadinessSummary;
  readinessUnavailable: boolean;
  syncQueued: boolean;
}) {
  const blockers = readiness.items.filter((item) => item.status === "blocker").slice(0, 4);
  const verifiedReady = !readinessUnavailable && readiness.readyToShare;
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-accent">Stage 05 / release verification</p>
      <h2 ref={headingRef} tabIndex={-1} id="launch-stage-release" className="mt-2 font-display text-3xl text-ink outline-none">
        内容已应用，现在检查真实公开结果
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
        下方入口只打开已经保存的站点内容。是否适合放进简历，仍以最新发布体检和公开入口验证为准。
      </p>

      <div className={`mt-7 rounded-xl border p-5 ${verifiedReady ? "border-accent-2/40 bg-accent-2/5" : "border-danger/40 bg-danger/5"}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className={`font-mono text-xs ${verifiedReady ? "text-accent-2" : "text-danger"}`}>
              {readinessUnavailable ? "VERIFY / HOLD" : verifiedReady ? "READY TO REVIEW" : "HOLD"}
            </span>
            <p className="mt-2 font-display text-3xl text-ink">
              {readinessUnavailable ? "待重新体检" : `${readiness.score}/100`}
            </p>
          </div>
          {!readinessUnavailable ? (
            <span className="font-mono text-xs text-ink-faint">
              {readiness.counts.blocker} blocker · {readiness.counts.warning} warning
            </span>
          ) : null}
        </div>
        {readinessUnavailable ? (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-muted">
            内容事务已经完成，但随后生成发布体检失败。这里不会沿用旧的 READY 结论；请手动重新检查。
          </p>
        ) : blockers.length > 0 ? (
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {blockers.map((item) => (
              <li key={item.id}>
                <Link href={item.action?.href ?? "/admin/readiness"} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line bg-bg-elevated px-3 text-sm text-ink-muted hover:border-accent hover:text-ink">
                  <span>{item.title}</span><span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {syncQueued ? (
        <p className="mt-4 text-sm text-ink-muted">站点内容同步已进入队列；知识库内部绑定仍沿用当前实例配置。</p>
      ) : null}

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Link href="/" target="_blank" rel="noreferrer" referrerPolicy="no-referrer" className="rounded-xl border border-line bg-bg-soft p-4 transition hover:border-accent">
          <span className="font-mono text-xs text-accent">PUBLIC</span>
          <strong className="mt-2 block text-ink">打开公开站点 ↗</strong>
        </Link>
        <Link href="/resume" target="_blank" rel="noreferrer" referrerPolicy="no-referrer" className="rounded-xl border border-line bg-bg-soft p-4 transition hover:border-accent">
          <span className="font-mono text-xs text-accent-2">RESUME</span>
          <strong className="mt-2 block text-ink">检查可打印简历 ↗</strong>
        </Link>
        <Link href="/admin/readiness" className="rounded-xl border border-line bg-bg-soft p-4 transition hover:border-accent">
          <span className="font-mono text-xs text-warn">GATE</span>
          <strong className="mt-2 block text-ink">运行发布体检 →</strong>
        </Link>
      </div>
    </div>
  );
}
