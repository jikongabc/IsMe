"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { Button, Input, Label, Select } from "@/components/admin/Field";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import {
  ProjectEvidenceFields,
  type ProjectDecisionDraft,
  type ProjectGalleryDraft,
  type ProjectMetricDraft,
} from "@/components/admin/ProjectEvidenceFields";
import type { ContentFormat } from "@/lib/content/format";
import type { Project } from "@/lib/db/schema";

type ProjectMetric = Omit<ProjectMetricDraft, "key">;
type ProjectDecision = Omit<ProjectDecisionDraft, "key">;
type ProjectGalleryImage = Omit<ProjectGalleryDraft, "key">;

type FormState = {
  id?: string;
  name: string;
  nameEn: string;
  slug: string;
  summary: string;
  summaryEn: string;
  description: string;
  descriptionEn: string;
  contentFormat: ContentFormat;
  coverUrl: string;
  repositoryUrl: string;
  demoUrl: string;
  techStack: string;
  role: string;
  roleEn: string;
  teamSize: string;
  duration: string;
  durationEn: string;
  metrics: ProjectMetricDraft[];
  decisions: ProjectDecisionDraft[];
  gallery: ProjectGalleryDraft[];
  featured: boolean;
  sortOrder: number;
  status: string;
};

type ReadinessItem = {
  label: string;
  ready: boolean;
};

let rowSequence = 0;

function createRowKey(kind: "metric" | "decision" | "gallery") {
  rowSequence += 1;
  return `${kind}-${Date.now()}-${rowSequence}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function createEmptyForm(): FormState {
  return {
    name: "",
    nameEn: "",
    slug: "",
    summary: "",
    summaryEn: "",
    description: "",
    descriptionEn: "",
    contentFormat: "markdown",
    coverUrl: "",
    repositoryUrl: "",
    demoUrl: "",
    techStack: "",
    role: "",
    roleEn: "",
    teamSize: "",
    duration: "",
    durationEn: "",
    metrics: [],
    decisions: [],
    gallery: [],
    featured: true,
    sortOrder: 0,
    status: "draft",
  };
}

function serializeForm(form: FormState): string {
  return JSON.stringify(form);
}

function normalizeMetrics(value: unknown): ProjectMetricDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const metric = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      key: createRowKey("metric"),
      label: text(metric.label),
      value: text(metric.value),
      context: text(metric.context),
      labelEn: text(metric.labelEn),
      valueEn: text(metric.valueEn),
      contextEn: text(metric.contextEn),
    };
  });
}

function normalizeDecisions(value: unknown): ProjectDecisionDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const decision = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      key: createRowKey("decision"),
      title: text(decision.title),
      tradeoff: text(decision.tradeoff),
      titleEn: text(decision.titleEn),
      tradeoffEn: text(decision.tradeoffEn),
    };
  });
}

function normalizeGallery(value: unknown): ProjectGalleryDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const image = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      key: createRowKey("gallery"),
      src: text(image.src),
      alt: text(image.alt),
      caption: text(image.caption),
      altEn: text(image.altEn),
      captionEn: text(image.captionEn),
    };
  });
}

function toForm(item: Project): FormState {
  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn ?? "",
    slug: item.slug,
    summary: item.summary,
    summaryEn: item.summaryEn ?? "",
    description: item.description,
    descriptionEn: item.descriptionEn ?? "",
    contentFormat: item.contentFormat === "html" ? "html" : "markdown",
    coverUrl: item.coverUrl,
    repositoryUrl: item.repositoryUrl,
    demoUrl: item.demoUrl,
    techStack: (item.techStack ?? []).join(", "),
    role: text(item.role),
    roleEn: text(item.roleEn),
    teamSize: item.teamSize && item.teamSize > 0 ? String(item.teamSize) : "",
    duration: text(item.duration),
    durationEn: text(item.durationEn),
    metrics: normalizeMetrics(item.metrics),
    decisions: normalizeDecisions(item.decisions),
    gallery: normalizeGallery(item.gallery),
    featured: item.featured,
    sortOrder: item.sortOrder,
    status: item.status,
  };
}

function getReadiness(form: FormState): ReadinessItem[] {
  return [
    {
      label: "摘要和完整案例正文",
      ready: Boolean(form.summary.trim() && form.description.trim()),
    },
    {
      label: "职责、周期和团队范围",
      ready: Boolean(form.role.trim() && form.duration.trim() && Number(form.teamSize) > 0),
    },
    {
      label: "至少一项可量化结果",
      ready: form.metrics.some((item) => item.label.trim() && item.value.trim()),
    },
    {
      label: "至少一项技术取舍",
      ready: form.decisions.some((item) => item.title.trim() && item.tradeoff.trim()),
    },
    {
      label: "带替代文本的证据图片",
      ready:
        form.gallery.length > 0 &&
        form.gallery.every((item) => Boolean(item.src.trim() && item.alt.trim())),
    },
  ];
}

function validateForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors["project-name"] = "请填写项目名称。";
  if (!form.slug.trim()) {
    errors["project-slug"] = "请填写公开路径。";
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    errors["project-slug"] = "路径只能使用小写字母、数字和单个连字符。";
  }
  if (form.teamSize.trim()) {
    const teamSize = Number(form.teamSize);
    if (!Number.isInteger(teamSize) || teamSize < 0 || teamSize > 10_000) {
      errors["project-team-size"] = "团队人数必须是 0 到 10,000 之间的整数。";
    }
  }
  const techStack = form.techStack
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (techStack.length > 40) {
    errors["project-tech-stack"] = "技术栈最多填写 40 项。";
  } else if (techStack.some((item) => item.length > 60)) {
    errors["project-tech-stack"] = "每项技术名称不能超过 60 个字符。";
  }

  form.metrics.forEach((metric) => {
    if (!metric.label.trim()) errors[`metric-${metric.key}-label`] = "请填写指标名称。";
    if (!metric.value.trim()) errors[`metric-${metric.key}-value`] = "请填写结果值。";
  });
  form.decisions.forEach((decision) => {
    if (!decision.title.trim()) errors[`decision-${decision.key}-title`] = "请说明做了什么选择。";
    if (!decision.tradeoff.trim()) {
      errors[`decision-${decision.key}-tradeoff`] = "请说明这项选择的收益与代价。";
    }
  });
  form.gallery.forEach((image) => {
    if (!image.src.trim()) errors[`gallery-${image.key}-src`] = "请选择或填写图片地址。";
    if (!image.alt.trim()) errors[`gallery-${image.key}-alt`] = "请填写能说明图片内容的替代文本。";
  });
  return errors;
}

function collectErrorMessages(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectErrorMessages);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectErrorMessages);
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    const details = collectErrorMessages(payload.error);
    return details.length > 0 ? `${fallback}：${details.join("；")}` : fallback;
  } catch {
    return fallback;
  }
}

function stripMetric(metric: ProjectMetricDraft): ProjectMetric {
  return {
    label: metric.label.trim(),
    value: metric.value.trim(),
    context: metric.context.trim(),
    labelEn: metric.labelEn.trim(),
    valueEn: metric.valueEn.trim(),
    contextEn: metric.contextEn.trim(),
  };
}

function stripDecision(decision: ProjectDecisionDraft): ProjectDecision {
  return {
    title: decision.title.trim(),
    tradeoff: decision.tradeoff.trim(),
    titleEn: decision.titleEn.trim(),
    tradeoffEn: decision.tradeoffEn.trim(),
  };
}

function stripGalleryImage(image: ProjectGalleryDraft): ProjectGalleryImage {
  return {
    src: image.src.trim(),
    alt: image.alt.trim(),
    caption: image.caption.trim(),
    altEn: image.altEn.trim(),
    captionEn: image.captionEn.trim(),
  };
}

function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return "草稿";
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} className="mt-1 text-xs text-danger">
      {error}
    </p>
  ) : null;
}

export function ProjectsManager({ initial }: { initial: Project[] }) {
  const router = useRouter();
  const editorRef = useRef<HTMLFormElement>(null);
  const editorTitleRef = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [savedForm, setSavedForm] = useState<FormState>(() => createEmptyForm());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listSuccess, setListSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const readiness = getReadiness(form);
  const readyCount = readiness.filter((item) => item.ready).length;
  const hasUnsavedChanges = serializeForm(form) !== serializeForm(savedForm);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const explicitNavigation = target?.closest<HTMLElement>("[data-navigation]");
      if (explicitNavigation) {
        if (!window.confirm("这个项目案例还有未保存的修改，离开后将丢失。确定继续吗？")) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      ) {
        return;
      }
      if (!window.confirm("这个项目案例还有未保存的修改，离开后将丢失。确定继续吗？")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [hasUnsavedChanges]);

  function focusEditor() {
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editorRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      editorTitleRef.current?.focus({ preventScroll: true });
    });
  }

  function startNew() {
    if (
      hasUnsavedChanges &&
      !window.confirm("这个项目案例还有未保存的修改。确定放弃这些修改吗？")
    ) {
      return;
    }
    const next = createEmptyForm();
    setForm(next);
    setSavedForm(next);
    setValidationErrors({});
    setError(null);
    setSuccess(null);
    setListError(null);
    setListSuccess(null);
    setDeleteCandidate(null);
    focusEditor();
  }

  function startEdit(item: Project) {
    if (
      hasUnsavedChanges &&
      !window.confirm("这个项目案例还有未保存的修改。确定切换到其他案例吗？")
    ) {
      return;
    }
    const next = toForm(item);
    setForm(next);
    setSavedForm(next);
    setValidationErrors({});
    setError(null);
    setSuccess(null);
    setListError(null);
    setListSuccess(null);
    setDeleteCandidate(null);
    focusEditor();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setValidationErrors(nextErrors);
    setError(null);
    setSuccess(null);
    const firstInvalidId = Object.keys(nextErrors)[0];
    if (firstInvalidId) {
      setError(`有 ${Object.keys(nextErrors).length} 项内容需要修正。`);
      requestAnimationFrame(() => document.getElementById(firstInvalidId)?.focus());
      return;
    }
    if (
      form.status === "published" &&
      readyCount < readiness.length &&
      !window.confirm(
        `这个案例的面试展示完整度只有 ${readyCount}/${readiness.length}。仍要以“已发布”状态保存吗？`,
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const { metrics, decisions, gallery, teamSize, ...base } = form;
      const response = await fetch("/api/admin/projects", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          name: base.name.trim(),
          nameEn: base.nameEn.trim(),
          slug: base.slug.trim(),
          summary: base.summary.trim(),
          summaryEn: base.summaryEn.trim(),
          coverUrl: base.coverUrl.trim(),
          repositoryUrl: base.repositoryUrl.trim(),
          demoUrl: base.demoUrl.trim(),
          role: base.role.trim(),
          roleEn: base.roleEn.trim(),
          duration: base.duration.trim(),
          durationEn: base.durationEn.trim(),
          teamSize: teamSize.trim() ? Number(teamSize) : 0,
          techStack: form.techStack
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          metrics: metrics.map(stripMetric),
          decisions: decisions.map(stripDecision),
          gallery: gallery.map(stripGalleryImage),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "项目保存失败"));

      const action = form.id ? "更新" : "创建";
      const projectName = form.name.trim();
      const next = createEmptyForm();
      setForm(next);
      setSavedForm(next);
      setValidationErrors({});
      setSuccess(`“${projectName}”已${action}。`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "项目保存失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function remove(item: Project) {
    if (deleteCandidate !== item.id) {
      setDeleteCandidate(item.id);
      setListError(null);
      setListSuccess(null);
      requestAnimationFrame(() => {
        document.getElementById(`confirm-delete-project-${item.id}`)?.focus();
      });
      return;
    }

    setDeletingId(item.id);
    setListError(null);
    setListSuccess(null);
    try {
      const response = await fetch(`/api/admin/projects?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await responseError(response, "项目删除失败"));
      if (form.id === item.id) {
        const next = createEmptyForm();
        setForm(next);
        setSavedForm(next);
        setValidationErrors({});
        setError(null);
      }
      setDeleteCandidate(null);
      setListSuccess(`“${item.name}”已删除。`);
      router.refresh();
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "项目删除失败，请稍后重试。");
    } finally {
      setDeletingId(null);
    }
  }

  function cancelDelete(itemId: string) {
    setDeleteCandidate(null);
    requestAnimationFrame(() => {
      document.getElementById(`delete-project-${itemId}`)?.focus();
    });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="project-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="project-list-title" className="font-display text-xl text-ink">
              已有案例
            </h2>
            <p className="mt-1 text-sm text-ink-muted">选择一个案例继续编辑，或建立新的证据包。</p>
          </div>
          <Button type="button" variant="ghost" onClick={startNew}>
            新建项目案例
          </Button>
        </div>

        {listError ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-bg-soft p-3 text-sm text-danger" role="alert">
            {listError}
          </p>
        ) : null}
        {listSuccess ? (
          <p className="mt-4 rounded-lg border border-accent-2/40 bg-bg-soft p-3 text-sm text-accent-2" role="status">
            {listSuccess}
          </p>
        ) : null}

        {initial.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-bg-soft p-5 text-sm text-ink-muted">
            还没有项目。先建立一个案例，并从你能解释清楚的真实项目开始。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {initial.map((item) => {
              const metrics = Array.isArray(item.metrics) ? item.metrics.length : 0;
              const decisions = Array.isArray(item.decisions) ? item.decisions.length : 0;
              const gallery = Array.isArray(item.gallery) ? item.gallery.length : 0;
              const awaitingConfirmation = deleteCandidate === item.id;
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-line bg-bg-elevated p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-ink">{item.name}</h3>
                        <span className="tag-chip">{statusLabel(item.status)}</span>
                        {item.featured ? <span className="tag-chip">精选</span> : null}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-ink-faint">/{item.slug}</p>
                      <p className="mt-3 text-xs text-ink-muted">
                        {metrics} 项结果 · {decisions} 项取舍 · {gallery} 张证据图片
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => startEdit(item)}>
                        编辑案例
                      </Button>
                      {awaitingConfirmation ? (
                        <>
                          <Button
                            id={`confirm-delete-project-${item.id}`}
                            type="button"
                            variant="danger"
                            disabled={deletingId === item.id}
                            onClick={() => void remove(item)}
                          >
                            {deletingId === item.id ? "删除中…" : "确认删除"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={deletingId === item.id}
                            onClick={() => cancelDelete(item.id)}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button
                          id={`delete-project-${item.id}`}
                          type="button"
                          variant="danger"
                          onClick={() => void remove(item)}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                  {awaitingConfirmation ? (
                    <p className="mt-3 text-sm text-danger" role="alert">
                      删除后无法从后台恢复。再次点击“确认删除”以继续。
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form
        ref={editorRef}
        onSubmit={save}
        noValidate
        className="project-evidence-editor space-y-6 rounded-2xl border border-line bg-bg-elevated p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="font-mono text-xs text-accent">项目证据档案</p>
            <h2
              ref={editorTitleRef}
              tabIndex={-1}
              className="mt-2 font-display text-2xl text-ink outline-none"
            >
              {form.id ? `编辑：${form.name || "未命名项目"}` : "建立项目证据包"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              先写清你的职责与结果，再补技术叙事。所有标有 * 的证据行字段都需要填写。
            </p>
          </div>
          {form.id ? (
            <Button type="button" variant="ghost" onClick={startNew}>
              放弃编辑
            </Button>
          ) : null}
        </div>

        <aside
          className="readiness-check rounded-xl border border-line bg-bg-soft p-4"
          aria-labelledby="project-readiness-title"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="project-readiness-title" className="font-display text-lg text-ink">
              面试展示完整度
            </h3>
            <span
              className={readyCount === readiness.length ? "text-sm text-accent-2" : "text-sm text-warn"}
              aria-live="polite"
            >
              {readyCount}/{readiness.length} 已完成
            </span>
          </div>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {readiness.map((item) => (
              <li key={item.label} className={item.ready ? "text-ink" : "text-ink-faint"}>
                <span className="sr-only">{item.ready ? "已完成：" : "未完成："}</span>
                <span aria-hidden="true" className="mr-2 font-mono">
                  {item.ready ? "✓" : "○"}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
          {form.status === "published" && readyCount < readiness.length ? (
            <p className="mt-3 border-t border-line pt-3 text-sm text-warn">
              当前状态为“已发布”，但仍缺少关键证据。可以保存，但建议补齐后再用于简历投递。
            </p>
          ) : null}
        </aside>

        <section aria-labelledby="project-identity-title" className="space-y-4">
          <div>
            <h3 id="project-identity-title" className="font-display text-lg text-ink">
              1. 项目标识
            </h3>
            <p className="mt-1 text-sm text-ink-muted">名称、公开路径以及列表页的一句话结论。</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="project-name">项目名称（中文） *</Label>
              <Input
                id="project-name"
                value={form.name}
                required
                maxLength={200}
                aria-invalid={validationErrors["project-name"] ? true : undefined}
                aria-describedby={validationErrors["project-name"] ? "project-name-error" : undefined}
                onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
              />
              <FieldError id="project-name" error={validationErrors["project-name"]} />
            </div>
            <div>
              <Label htmlFor="project-name-en">Project name (EN)</Label>
              <Input
                id="project-name-en"
                value={form.nameEn}
                maxLength={200}
                onChange={(event) => setForm((value) => ({ ...value, nameEn: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="project-slug">公开路径 *</Label>
              <Input
                id="project-slug"
                value={form.slug}
                required
                maxLength={120}
                placeholder="project-name"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={validationErrors["project-slug"] ? true : undefined}
                aria-describedby={
                  validationErrors["project-slug"]
                    ? "project-slug-hint project-slug-error"
                    : "project-slug-hint"
                }
                onChange={(event) => setForm((value) => ({ ...value, slug: event.target.value }))}
              />
              <p id="project-slug-hint" className="mt-1 text-xs text-ink-faint">
                仅使用小写字母、数字和连字符；发布后修改会改变公开链接。
              </p>
              <FieldError id="project-slug" error={validationErrors["project-slug"]} />
            </div>
            <div>
              <Label htmlFor="project-status">发布状态</Label>
              <Select
                id="project-status"
                value={form.status}
                onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}
              >
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="project-summary">项目摘要（中文）</Label>
              <Input
                id="project-summary"
                value={form.summary}
                maxLength={500}
                placeholder="问题、你的动作和结果，尽量在一句话内说明"
                onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="project-summary-en">Project summary (EN)</Label>
              <Input
                id="project-summary-en"
                value={form.summaryEn}
                maxLength={500}
                onChange={(event) => setForm((value) => ({ ...value, summaryEn: event.target.value }))}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="project-scope-title" className="space-y-4 border-t border-line pt-6">
          <div>
            <h3 id="project-scope-title" className="font-display text-lg text-ink">
              2. 职责与范围
            </h3>
            <p className="mt-1 text-sm text-ink-muted">让面试官能区分团队成果和你的个人贡献。</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="project-role">你的职责（中文）</Label>
              <Input
                id="project-role"
                value={form.role}
                maxLength={200}
                placeholder="例如：后端负责人 / 独立开发"
                onChange={(event) => setForm((value) => ({ ...value, role: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="project-role-en">Your role (EN)</Label>
              <Input
                id="project-role-en"
                value={form.roleEn}
                maxLength={200}
                onChange={(event) => setForm((value) => ({ ...value, roleEn: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="project-duration">项目周期（中文）</Label>
              <Input
                id="project-duration"
                value={form.duration}
                maxLength={120}
                placeholder="例如：2025.03–2025.06 / 12 周"
                onChange={(event) => setForm((value) => ({ ...value, duration: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="project-duration-en">Duration (EN)</Label>
              <Input
                id="project-duration-en"
                value={form.durationEn}
                maxLength={120}
                onChange={(event) => setForm((value) => ({ ...value, durationEn: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="project-team-size">团队人数</Label>
              <Input
                id="project-team-size"
                type="number"
                min={0}
                max={10000}
                step={1}
                inputMode="numeric"
                value={form.teamSize}
                placeholder="独立项目可填写 1"
                aria-invalid={validationErrors["project-team-size"] ? true : undefined}
                aria-describedby={validationErrors["project-team-size"] ? "project-team-size-error" : undefined}
                onChange={(event) => setForm((value) => ({ ...value, teamSize: event.target.value }))}
              />
              <FieldError id="project-team-size" error={validationErrors["project-team-size"]} />
            </div>
            <div>
              <Label htmlFor="project-sort-order">排序权重</Label>
              <Input
                id="project-sort-order"
                type="number"
                step={1}
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((value) => ({ ...value, sortOrder: Number(event.target.value) || 0 }))
                }
              />
            </div>
            <div>
              <Label htmlFor="project-repository-url">代码仓库</Label>
              <Input
                id="project-repository-url"
                value={form.repositoryUrl}
                maxLength={500}
                placeholder="https://github.com/..."
                inputMode="url"
                onChange={(event) =>
                  setForm((value) => ({ ...value, repositoryUrl: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="project-demo-url">在线演示</Label>
              <Input
                id="project-demo-url"
                value={form.demoUrl}
                maxLength={500}
                placeholder="https://..."
                inputMode="url"
                onChange={(event) => setForm((value) => ({ ...value, demoUrl: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="project-tech-stack">技术栈</Label>
              <Input
                id="project-tech-stack"
                value={form.techStack}
                placeholder="Next.js, TypeScript, SQLite"
                aria-invalid={validationErrors["project-tech-stack"] ? true : undefined}
                aria-describedby={
                  validationErrors["project-tech-stack"]
                    ? "project-tech-stack-hint project-tech-stack-error"
                    : "project-tech-stack-hint"
                }
                onChange={(event) => setForm((value) => ({ ...value, techStack: event.target.value }))}
              />
              <p id="project-tech-stack-hint" className="mt-1 text-xs text-ink-faint">
                使用英文逗号分隔，最多保留 40 项。
              </p>
              <FieldError id="project-tech-stack" error={validationErrors["project-tech-stack"]} />
            </div>
          </div>
          <label className="flex w-fit items-center gap-2 rounded-lg border border-line bg-bg-soft px-3 py-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) => setForm((value) => ({ ...value, featured: event.target.checked }))}
            />
            在首页精选区域展示
          </label>
        </section>

        <section aria-labelledby="project-visual-title" className="space-y-4 border-t border-line pt-6">
          <div>
            <h3 id="project-visual-title" className="font-display text-lg text-ink">
              3. 列表封面
            </h3>
            <p className="mt-1 text-sm text-ink-muted">用于首页和项目列表；详细过程图片放在后面的证据画廊。</p>
          </div>
          <ImageUploadField
            id="project-cover-url"
            label="封面图片"
            value={form.coverUrl}
            hint="建议使用清晰的产品界面或架构主图，而不是通用装饰图。"
            onChange={(coverUrl) => setForm((value) => ({ ...value, coverUrl }))}
          />
        </section>

        <section aria-labelledby="project-evidence-title" className="space-y-5 border-t border-line pt-6">
          <div>
            <h3 id="project-evidence-title" className="font-display text-lg text-ink">
              4. 案例证据
            </h3>
            <p className="mt-1 text-sm text-ink-muted">结果、选择和可验证材料共同构成案例的证据链。</p>
          </div>
          <ProjectEvidenceFields
            metrics={form.metrics}
            decisions={form.decisions}
            gallery={form.gallery}
            errors={validationErrors}
            createKey={createRowKey}
            onMetricsChange={(metrics) => setForm((value) => ({ ...value, metrics }))}
            onDecisionsChange={(decisions) => setForm((value) => ({ ...value, decisions }))}
            onGalleryChange={(gallery) => setForm((value) => ({ ...value, gallery }))}
          />
        </section>

        <section aria-labelledby="project-narrative-title" className="space-y-5 border-t border-line pt-6">
          <div>
            <h3 id="project-narrative-title" className="font-display text-lg text-ink">
              5. 完整案例叙事
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              建议按背景、约束、行动、结果和复盘组织，避免重复上面的结构化证据。
            </p>
          </div>
          <ContentEditor
            label="案例正文（中文）"
            value={form.description}
            format={form.contentFormat}
            onChange={(description) => setForm((value) => ({ ...value, description }))}
            onFormatChange={(contentFormat) => setForm((value) => ({ ...value, contentFormat }))}
            rows={10}
          />
          <ContentEditor
            label="Case study (EN)"
            value={form.descriptionEn}
            format={form.contentFormat}
            onChange={(descriptionEn) => setForm((value) => ({ ...value, descriptionEn }))}
            showFormatSelect={false}
            rows={10}
          />
        </section>

        <div className="z-10 rounded-xl border border-line bg-bg-elevated/95 p-3 shadow-lg backdrop-blur sm:sticky sm:bottom-3">
          {error ? (
            <p className="mb-3 text-sm text-danger" role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mb-3 text-sm text-accent-2" role="status" aria-live="polite">
              {success}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-faint">
              {form.status === "published" ? "保存后公开页面将使用最新内容。" : "草稿和归档内容不会出现在公开列表。"}
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "保存中…" : form.id ? "保存项目更新" : "创建项目案例"}
              </Button>
              {form.id ? (
                <Button type="button" variant="ghost" disabled={loading} onClick={startNew}>
                  取消
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
