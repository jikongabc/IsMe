"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createStarterPortfolioPack } from "@/lib/portfolio-pack";
import {
  isValidApplyReceipt,
  normalizeReadiness,
  normalizeReviewPlan,
  type ReadinessSummary,
  type ReviewPlan,
  type SetupSnapshot,
} from "./models";
import {
  ApplyStage,
  InventoryStage,
  ReleaseStage,
  ReviewStage,
  TransferStage,
  type BusyAction,
} from "./LaunchStudioStages";
import {
  decodeStoredStudioDraft,
  defaultSelectedSections,
  encodeStoredStudioDraft,
  MAX_PORTFOLIO_BUNDLE_BYTES,
  parsePortfolioPackDraft,
  STUDIO_DRAFT_STORAGE_KEY,
  tryStoreStudioDraft,
  type ParsedPackDraft,
  type PortfolioSectionKey,
} from "./state";

type Props = {
  initialSnapshot: SetupSnapshot;
  initialReadiness: ReadinessSummary;
};

type StudioStage = "inventory" | "transfer" | "review" | "apply" | "release";
const stages: Array<{
  id: StudioStage;
  code: string;
  label: string;
  description: string;
}> = [
  { id: "inventory", code: "01", label: "识别当前内容", description: "确认真实内容与 demo 边界" },
  { id: "transfer", code: "02", label: "带入站点包", description: "内容 JSON 或自包含媒体包" },
  { id: "review", code: "03", label: "审阅栏目差异", description: "核对新增、替换与发布调整" },
  { id: "apply", code: "04", label: "原子应用", description: "一次提交所选栏目" },
  { id: "release", code: "05", label: "验证公开入口", description: "预览已应用内容并运行体检" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadError(payload: unknown, fallback: string) {
  if (isRecord(payload) && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

function sameSections(left: PortfolioSectionKey[], right: PortfolioSectionKey[]) {
  return left.length === right.length && left.every((key) => right.includes(key));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function saveJsonDownload(value: unknown, filename: string) {
  const blob = value instanceof Blob
    ? value
    : new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const value = match?.[1]?.trim() || fallback;
  return value.split(/[\\/]/).pop() || fallback;
}

export function LaunchStudio({ initialSnapshot, initialReadiness }: Props) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const [stage, setStage] = useState<StudioStage>("inventory");
  const [draftText, setDraftText] = useState("");
  const [draft, setDraft] = useState<ParsedPackDraft | null>(null);
  const [draftName, setDraftName] = useState("");
  const [selectedSections, setSelectedSections] = useState<PortfolioSectionKey[]>([]);
  const [rememberDraft, setRememberDraft] = useState(false);
  const [storageState, setStorageState] = useState<"idle" | "saved" | "too-large" | "unavailable">("idle");
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [demoPlan, setDemoPlan] = useState<ReviewPlan | null>(null);
  const [demoConfirmed, setDemoConfirmed] = useState(false);
  const [demoRemoved, setDemoRemoved] = useState(false);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [syncQueued, setSyncQueued] = useState(false);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [readinessUnavailable, setReadinessUnavailable] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let stored = null;
    let storageUnavailable = false;
    try {
      stored = decodeStoredStudioDraft(window.localStorage.getItem(STUDIO_DRAFT_STORAGE_KEY));
    } catch {
      storageUnavailable = true;
    }
    const restored = stored ? parsePortfolioPackDraft(stored.text) : null;
    queueMicrotask(() => {
      if (!active) return;
      if (storageUnavailable) setStorageState("unavailable");
      if (stored && restored?.ok) {
        draftRevisionRef.current += 1;
        setDraftText(restored.value.text);
        setDraft(restored.value);
        setDraftName("浏览器恢复草稿");
        setSelectedSections(
          stored.selectedSections.length > 0
            ? stored.selectedSections.filter((key) => restored.value.sections.includes(key))
            : defaultSelectedSections(
                restored.value.sections,
                initialSnapshot.sections,
                initialSnapshot.recommendedSelection,
              ),
        );
        setStage("transfer");
        setRememberDraft(true);
        setStorageState("saved");
        setNotice("已恢复这台浏览器上次保存的导入草稿；仍需重新生成服务端预览。 ");
      }
      mountedRef.current = true;
    });
    return () => {
      active = false;
    };
  }, [initialSnapshot.recommendedSelection, initialSnapshot.sections]);

  useEffect(() => {
    if (!mountedRef.current || !draft || !rememberDraft) return;
    const encoded = encodeStoredStudioDraft(draft.text, selectedSections);
    if (!encoded) {
      try {
        window.localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
      } catch {
        // Storage is optional; a large draft remains usable in memory.
      }
      queueMicrotask(() => setStorageState("too-large"));
      return;
    }
    const nextStorageState = tryStoreStudioDraft(window.localStorage, encoded)
      ? "saved"
      : "unavailable";
    queueMicrotask(() => setStorageState(nextStorageState));
  }, [draft, rememberDraft, selectedSections]);

  useEffect(() => {
    if (rememberDraft) return;
    try {
      window.localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
    } catch {
      // Storage is optional; import remains available in the current page.
    }
    queueMicrotask(() => setStorageState("idle"));
  }, [rememberDraft]);

  useEffect(() => {
    if (!mountedRef.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  function moveTo(next: StudioStage) {
    clearMessages();
    setStage(next);
  }

  function discardStoredDraft() {
    try {
      window.localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
      setStorageState("idle");
    } catch {
      setStorageState("unavailable");
    }
  }

  function acceptDraft(text: string, name: string) {
    clearMessages();
    draftRevisionRef.current += 1;
    const parsed = parsePortfolioPackDraft(text);
    if (!parsed.ok) {
      discardStoredDraft();
      setDraft(null);
      setPlan(null);
      setSelectedSections([]);
      setImportConfirmed(false);
      setApplied(false);
      setError(parsed.error);
      return false;
    }
    setDraftText(parsed.value.text);
    setDraft(parsed.value);
    setDraftName(name);
    setSelectedSections(defaultSelectedSections(
      parsed.value.sections,
      initialSnapshot.sections,
      initialSnapshot.recommendedSelection,
    ));
    setPlan(null);
    setImportConfirmed(false);
    setApplied(false);
    setNotice(
      parsed.value.format === "bundle"
        ? `浏览器初筛通过：自包含站点包含 ${parsed.value.sections.length} 个栏目、${parsed.value.assetCount} 个媒体项（${formatBytes(parsed.value.assetBytes)}）。服务端仍会逐项验签。`
        : `浏览器初筛通过：${parsed.value.sections.length} 个栏目，${formatBytes(parsed.value.bytes)}。服务端仍会完整校验。`,
    );
    return true;
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PORTFOLIO_BUNDLE_BYTES) {
      setError(`文件超过 ${MAX_PORTFOLIO_BUNDLE_BYTES / 1024 / 1024} MiB 上限。`);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      setError("请选择 .json 文件；首版不解析 PDF 或 Word。 ");
      return;
    }
    try {
      acceptDraft(await file.text(), file.name);
    } catch {
      setError("无法读取这个文件，请重新选择。 ");
    }
  }

  function clearBrowserDraft() {
    try {
      window.localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
    } catch {
      // Storage is optional; clearing the in-memory persistence preference is enough.
    }
    setRememberDraft(false);
    setStorageState("idle");
    setNotice("已清除这台浏览器保存的导入草稿。当前页面内容仍保留，关闭前可继续审阅。 ");
  }

  function toggleSection(key: PortfolioSectionKey) {
    draftRevisionRef.current += 1;
    setSelectedSections((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
    setPlan(null);
    setImportConfirmed(false);
    setApplied(false);
  }

  async function downloadCurrentPack() {
    setBusy("download");
    clearMessages();
    try {
      const response = await fetch("/api/admin/portfolio-pack", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(payloadError(payload, "当前内容包下载失败。"));
      }
      saveJsonDownload(
        await response.blob(),
        responseFilename(response, `portfolio-pack-${new Date().toISOString().slice(0, 10)}.json`),
      );
      setNotice("当前站点内容包已下载。它不包含管理员密码、服务密钥、内部知识库绑定或 /uploads 文件字节；换机器还需搬运 uploads/S3 对象。 ");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "当前内容包下载失败。 ");
    } finally {
      setBusy(null);
    }
  }

  async function downloadCurrentBundle() {
    setBusy("bundle-download");
    clearMessages();
    try {
      const response = await fetch("/api/admin/portfolio-bundle", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(payloadError(payload, "自包含站点包下载失败。"));
      }
      saveJsonDownload(
        await response.blob(),
        responseFilename(response, `portfolio-bundle-${new Date().toISOString().slice(0, 10)}.isme.json`),
      );
      setNotice("自包含站点包已下载：受管图片已内嵌并附带 SHA-256；密钥、密码和知识库内部绑定仍未导出。 ");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "自包含站点包下载失败。 ");
    } finally {
      setBusy(null);
    }
  }

  function downloadStarterPack() {
    clearMessages();
    saveJsonDownload(createStarterPortfolioPack(), "portfolio-pack.v1.blank.json");
    setNotice("空白模板已下载。填写后可回到这里选择文件或粘贴 JSON。 ");
  }

  async function previewImport() {
    if (!draft || selectedSections.length === 0) {
      setError("至少选择一个栏目，才能生成差异预览。 ");
      return;
    }
    setBusy("preview");
    clearMessages();
    const requestedRevision = draftRevisionRef.current;
    const requestedSections = [...selectedSections];
    const requestedPack = draft.pack;
    try {
      const response = await fetch(
        draft.format === "bundle"
          ? "/api/admin/portfolio-bundle/preview"
          : "/api/admin/portfolio-pack/preview",
        {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          draft.format === "bundle"
            ? { bundle: draft.bundle, sections: requestedSections }
            : { pack: requestedPack, sections: requestedSections },
        ),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payloadError(payload, "服务端无法生成导入预览。"));
      const nextPlan = isRecord(payload) && payload.ok === true
        ? normalizeReviewPlan(payload.plan)
        : null;
      if (!nextPlan) throw new Error("预览响应格式无效；没有应用任何内容。 ");
      if (requestedRevision !== draftRevisionRef.current) {
        throw new Error("内容包或栏目已在预览期间变化；旧结果已丢弃，请重新生成差异。 ");
      }
      if (!sameSections(nextPlan.selectedSections, requestedSections)) {
        throw new Error("预览返回的栏目选择与请求不一致；没有应用任何内容。 ");
      }
      setPlan(nextPlan);
      setImportConfirmed(false);
      setStage("review");
      setNotice("服务端预览完成。当前仍未写入任何内容。 ");
    } catch (caught) {
      setPlan(null);
      setError(caught instanceof Error ? caught.message : "服务端无法生成导入预览。 ");
    } finally {
      setBusy(null);
    }
  }

  async function applyImport() {
    if (!draft || !plan || !importConfirmed || plan.blockers.length > 0) {
      setError("应用互锁仍未解除；请完成预览、处理阻断并确认所选栏目。 ");
      return;
    }
    setBusy("import");
    clearMessages();
    try {
      const response = await fetch(
        draft.format === "bundle"
          ? "/api/admin/portfolio-bundle/import"
          : "/api/admin/portfolio-pack/import",
        {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          draft.format === "bundle"
            ? {
                bundle: draft.bundle,
                sections: selectedSections,
                confirmation: "IMPORT PORTFOLIO BUNDLE",
                planFingerprint: plan.fingerprint,
              }
            : {
                pack: draft.pack,
                sections: selectedSections,
                confirmation: "IMPORT PORTFOLIO PACK",
                planFingerprint: plan.fingerprint,
              },
        ),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setPlan(null);
        setImportConfirmed(false);
        setStage("transfer");
        throw new Error("站点内容已在预览后发生变化。旧差异已失效，请重新生成服务端预览。 ");
      }
      if (!response.ok) throw new Error(payloadError(payload, "内容包未能应用。"));
      if (
        !isRecord(payload)
        || payload.ok !== true
        || !isValidApplyReceipt(payload.result, plan.fingerprint, selectedSections)
      ) {
        setPlan(null);
        setImportConfirmed(false);
        setReadinessUnavailable(true);
        setStage("inventory");
        throw new Error("服务端返回的应用回执无效；请勿重复提交，先刷新并重新盘点站点。 ");
      }
      const nextReadiness = payload.report === null
        ? null
        : normalizeReadiness(payload.report);
      if (nextReadiness) setReadiness(nextReadiness);
      setReadinessUnavailable(!nextReadiness);
      setSyncQueued(payload.syncQueued === true);
      setApplied(true);
      setStage("release");
      setRememberDraft(false);
      try {
        window.localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
      } catch {
        // The import already succeeded; storage cleanup must not change that result.
      }
      setNotice(
        nextReadiness
          ? "所选栏目已在一次事务中应用。下一步只预览已保存内容并运行发布体检。 "
          : "所选栏目已成功应用，但发布体检暂不可用。请在发布体检页重新检查后再分享。 ",
      );
      router.refresh();
    } catch (caught) {
      setApplied(false);
      setError(caught instanceof Error ? caught.message : "内容包未能应用。 ");
    } finally {
      setBusy(null);
    }
  }

  async function previewDemoCleanup() {
    setBusy("demo-preview");
    clearMessages();
    try {
      const response = await fetch("/api/admin/setup/demo-preview", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payloadError(payload, "无法预览 demo 清理范围。"));
      const nextPlan = isRecord(payload) && payload.ok === true
        ? normalizeReviewPlan(payload.plan)
        : null;
      if (!nextPlan) throw new Error("清理预览响应格式无效；没有删除任何内容。 ");
      setDemoPlan(nextPlan);
      setDemoConfirmed(false);
      setNotice("清理预览已生成；尚未删除任何内容。 ");
    } catch (caught) {
      setDemoPlan(null);
      setError(caught instanceof Error ? caught.message : "无法预览 demo 清理范围。 ");
    } finally {
      setBusy(null);
    }
  }

  async function cleanupDemo() {
    if (!demoPlan || !demoConfirmed || demoPlan.blockers.length > 0) {
      setError("请先审阅清理清单并确认；有阻断时不会删除内容。 ");
      return;
    }
    setBusy("demo-cleanup");
    clearMessages();
    try {
      const response = await fetch("/api/admin/setup/demo-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          confirmation: "REMOVE DEMO CONTENT",
          planFingerprint: demoPlan.fingerprint,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setDemoPlan(null);
        setDemoConfirmed(false);
        throw new Error("站点内容已在清理预览后发生变化。旧清单已失效，请重新预览清理范围。 ");
      }
      if (!response.ok) throw new Error(payloadError(payload, "Demo 内容没有被清理。"));
      if (
        !isRecord(payload)
        || payload.ok !== true
        || !isValidApplyReceipt(
          payload.result,
          demoPlan.fingerprint,
          demoPlan.selectedSections,
        )
      ) {
        setDemoPlan(null);
        setDemoConfirmed(false);
        setReadinessUnavailable(true);
        throw new Error("服务端返回的清理回执无效；请勿重复提交，先刷新并重新盘点站点。 ");
      }
      const nextReadiness = payload.report === null
        ? null
        : normalizeReadiness(payload.report);
      if (nextReadiness) setReadiness(nextReadiness);
      setReadinessUnavailable(!nextReadiness);
      setSyncQueued(payload.syncQueued === true);
      setDemoRemoved(true);
      setDemoPlan(null);
      setDemoConfirmed(false);
      setNotice(
        nextReadiness
          ? "已按预览清单清理可识别的 demo 内容；真实内容未被默认选中。 "
          : "Demo 内容已成功清理，但发布体检暂不可用。请在发布体检页重新检查后再分享。 ",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo 内容没有被清理。 ");
    } finally {
      setBusy(null);
    }
  }

  const activeIndex = stages.findIndex((item) => item.id === stage);
  const stageUnlocked = (id: StudioStage) => {
    if (id === "inventory" || id === "transfer") return true;
    if (id === "review") return plan !== null;
    if (id === "apply") return plan !== null && plan.blockers.length === 0;
    return applied;
  };
  const storageCopy =
    storageState === "saved"
      ? "草稿与栏目选择已保存在这台浏览器。"
      : storageState === "too-large"
        ? "草稿可继续预览，但超过 750 KiB，刷新后不会恢复。"
        : storageState === "unavailable"
          ? "浏览器无法保存草稿；当前页面仍可继续，刷新后不会恢复。"
          : "勾选后会把当前 JSON 与栏目选择保存在这台浏览器。";

  return (
    <div className="space-y-8" aria-busy={busy !== null}>
      <header className="launch-studio-hero">
        <div className="relative z-10">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-accent">
            Site commissioning / portfolio-pack.v1 + portfolio-bundle.v1
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h1 className="max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                把内容带进来，先演算，再投产。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">
                Launch Studio 搬运站点内容与发布状态，但不搬运密钥和内部绑定。每次导入先生成服务端差异，确认后再用一次事务应用。
              </p>
            </div>
            <div className="launch-interlock-badge" data-clear={!readinessUnavailable && readiness.readyToShare ? "true" : "false"}>
              <span>{readinessUnavailable ? "VERIFY" : readiness.readyToShare ? "CLEAR" : "HOLD"}</span>
              <small>
                {readinessUnavailable
                  ? "readiness check required"
                  : `${readiness.counts.blocker} blocker · ${readiness.score}/100`}
              </small>
            </div>
          </div>
        </div>
      </header>

      <div className="launch-studio-layout">
        <nav aria-label="首发工作台阶段">
          <ol className="commissioning-rail">
            {stages.map((item, index) => {
              const unlocked = stageUnlocked(item.id);
              const current = item.id === stage;
              const complete = index < activeIndex || (item.id === "release" && applied);
              return (
                <li key={item.id} className="commissioning-node" data-state={current ? "current" : complete ? "complete" : unlocked ? "available" : "locked"}>
                  <button
                    type="button"
                    disabled={!unlocked || busy !== null}
                    aria-current={current ? "step" : undefined}
                    onClick={() => moveTo(item.id)}
                  >
                    <span className="commissioning-node-code" aria-hidden="true">
                      {complete ? "✓" : item.code}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="min-h-6" aria-live="polite" aria-atomic="true">
            {error ? (
              <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger outline-none">
                {error}
              </div>
            ) : busy ? (
              <p role="status" className="text-sm text-warn">正在执行只读演算或受控操作…</p>
            ) : notice ? (
              <p role="status" className="text-sm text-accent-2">{notice}</p>
            ) : null}
          </div>

          <section className="launch-stage-panel" aria-labelledby={`launch-stage-${stage}`}>
            {stage === "inventory" ? (
              <InventoryStage
                headingRef={headingRef}
                snapshot={initialSnapshot}
                readiness={readiness}
                busy={busy}
                demoPlan={demoPlan}
                demoConfirmed={demoConfirmed}
                demoRemoved={demoRemoved}
                onDemoConfirmed={setDemoConfirmed}
                onPreviewDemo={() => void previewDemoCleanup()}
                onCleanupDemo={() => void cleanupDemo()}
                onContinue={() => moveTo("transfer")}
              />
            ) : null}

            {stage === "transfer" ? (
              <TransferStage
                headingRef={headingRef}
                draftText={draftText}
                draft={draft}
                draftName={draftName}
                selectedSections={selectedSections}
                snapshot={initialSnapshot}
                rememberDraft={rememberDraft}
                storageCopy={storageCopy}
                busy={busy}
                onTextChange={(value) => {
                  draftRevisionRef.current += 1;
                  discardStoredDraft();
                  setDraftText(value);
                  setDraft(null);
                  setPlan(null);
                  setSelectedSections([]);
                  setImportConfirmed(false);
                  setApplied(false);
                  setNotice("JSON 已更改，旧浏览器草稿和差异预览已失效；请重新初筛。 ");
                }}
                onScreen={() => acceptDraft(draftText, "粘贴的 JSON")}
                onFile={(file) => void readFile(file)}
                onToggleSection={toggleSection}
                onRememberDraft={setRememberDraft}
                onClearStored={clearBrowserDraft}
                onDownloadCurrent={() => void downloadCurrentPack()}
                onDownloadBundle={() => void downloadCurrentBundle()}
                onDownloadStarter={downloadStarterPack}
                onPreview={() => void previewImport()}
              />
            ) : null}

            {stage === "review" && plan ? (
              <ReviewStage
                headingRef={headingRef}
                plan={plan}
                selectedSections={selectedSections}
                onAdjust={() => moveTo("transfer")}
                onContinue={() => moveTo("apply")}
              />
            ) : null}

            {stage === "apply" && plan ? (
              <ApplyStage
                headingRef={headingRef}
                plan={plan}
                selectedSections={selectedSections}
                confirmed={importConfirmed}
                busy={busy}
                onConfirmed={setImportConfirmed}
                onBack={() => moveTo("review")}
                onApply={() => void applyImport()}
              />
            ) : null}

            {stage === "release" && applied ? (
              <ReleaseStage
                headingRef={headingRef}
                readiness={readiness}
                readinessUnavailable={readinessUnavailable}
                syncQueued={syncQueued}
              />
            ) : null}
          </section>
        </div>
      </div>

      <aside className="rounded-xl border border-line bg-bg-elevated p-4 text-sm leading-6 text-ink-muted" aria-label="内容包安全边界">
        <strong className="text-ink">迁移边界：</strong>不解析 PDF，不抓取任意外部图片，不调用 AI，也不自动生成姓名、履历、指标或技术事实。portfolio-pack.v1 仍是轻量纯内容格式；portfolio-bundle.v1 只内嵌媒体库中已注册且被内容引用的图片，并逐项校验 SHA-256 与文件魔数。未提交前展示的是差异与就绪度投影，不是公开页面实时预览。
      </aside>
    </div>
  );
}
