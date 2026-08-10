"use client";

import { Button, Input, Label, Textarea } from "@/components/admin/Field";
import { ImageUploadField } from "@/components/admin/ImageUploadField";

export type ProjectMetricDraft = {
  key: string;
  label: string;
  value: string;
  context: string;
  labelEn: string;
  valueEn: string;
  contextEn: string;
};

export type ProjectDecisionDraft = {
  key: string;
  title: string;
  tradeoff: string;
  titleEn: string;
  tradeoffEn: string;
};

export type ProjectGalleryDraft = {
  key: string;
  src: string;
  alt: string;
  caption: string;
  altEn: string;
  captionEn: string;
};

type Props = {
  metrics: ProjectMetricDraft[];
  decisions: ProjectDecisionDraft[];
  gallery: ProjectGalleryDraft[];
  errors: Record<string, string>;
  onMetricsChange: (metrics: ProjectMetricDraft[]) => void;
  onDecisionsChange: (decisions: ProjectDecisionDraft[]) => void;
  onGalleryChange: (gallery: ProjectGalleryDraft[]) => void;
  createKey: (kind: "metric" | "decision" | "gallery") => string;
};

type InputFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
};

function EvidenceInput({
  id,
  label,
  value,
  error,
  placeholder,
  required,
  maxLength,
  onChange,
}: InputFieldProps & { onChange: (value: string) => void }) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceTextarea({
  id,
  label,
  value,
  error,
  placeholder,
  required,
  maxLength,
  rows = 3,
  onChange,
}: InputFieldProps & { rows?: number; onChange: (value: string) => void }) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Textarea
        id={id}
        value={value}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RowActions({
  label,
  index,
  count,
  onMove,
  onRemove,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label={`${label}排序与删除`}>
      <Button
        type="button"
        variant="ghost"
        className="!px-2 !py-1 text-xs"
        disabled={index === 0}
        aria-label={`上移${label}`}
        onClick={() => onMove(index, index - 1)}
      >
        上移
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="!px-2 !py-1 text-xs"
        disabled={index === count - 1}
        aria-label={`下移${label}`}
        onClick={() => onMove(index, index + 1)}
      >
        下移
      </Button>
      <Button
        type="button"
        variant="danger"
        className="!px-2 !py-1 text-xs"
        aria-label={`删除${label}`}
        onClick={onRemove}
      >
        删除
      </Button>
    </div>
  );
}

function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (to < 0 || to >= rows.length || from === to) return rows;
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

export function ProjectEvidenceFields({
  metrics,
  decisions,
  gallery,
  errors,
  onMetricsChange,
  onDecisionsChange,
  onGalleryChange,
  createKey,
}: Props) {
  function focusSoon(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function addMetric() {
    const key = createKey("metric");
    onMetricsChange([
      ...metrics,
      {
        key,
        label: "",
        value: "",
        context: "",
        labelEn: "",
        valueEn: "",
        contextEn: "",
      },
    ]);
    focusSoon(`metric-${key}-label`);
  }

  function removeMetric(index: number) {
    const nextFocus = metrics[index + 1] ?? metrics[index - 1];
    onMetricsChange(metrics.filter((_, row) => row !== index));
    focusSoon(nextFocus ? `metric-${nextFocus.key}-label` : "add-project-metric");
  }

  function addDecision() {
    const key = createKey("decision");
    onDecisionsChange([
      ...decisions,
      { key, title: "", tradeoff: "", titleEn: "", tradeoffEn: "" },
    ]);
    focusSoon(`decision-${key}-title`);
  }

  function removeDecision(index: number) {
    const nextFocus = decisions[index + 1] ?? decisions[index - 1];
    onDecisionsChange(decisions.filter((_, row) => row !== index));
    focusSoon(nextFocus ? `decision-${nextFocus.key}-title` : "add-project-decision");
  }

  function addGalleryImage() {
    const key = createKey("gallery");
    onGalleryChange([
      ...gallery,
      { key, src: "", alt: "", caption: "", altEn: "", captionEn: "" },
    ]);
    focusSoon(`gallery-${key}-src`);
  }

  function removeGalleryImage(index: number) {
    const nextFocus = gallery[index + 1] ?? gallery[index - 1];
    onGalleryChange(gallery.filter((_, row) => row !== index));
    focusSoon(nextFocus ? `gallery-${nextFocus.key}-src` : "add-project-gallery");
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="project-metrics-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="project-metrics-title" className="font-display text-lg text-ink">
              可量化结果
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              用“指标名称 + 结果值 + 计算口径”说明项目产生了什么变化，避免只罗列功能。
            </p>
          </div>
          <Button
            id="add-project-metric"
            type="button"
            variant="ghost"
            disabled={metrics.length >= 20}
            onClick={addMetric}
          >
            {metrics.length >= 20 ? "最多 20 项" : "添加结果"}
          </Button>
        </div>

        {metrics.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-bg-soft p-4 text-sm text-ink-faint">
            还没有成果指标。优先填写性能、效率、稳定性或业务结果中最能证明价值的一项。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {metrics.map((metric, index) => {
              const prefix = `metric-${metric.key}`;
              return (
                <fieldset
                  key={metric.key}
                  className="evidence-row rounded-xl border border-line bg-bg-soft p-4"
                >
                  <legend className="sr-only">成果指标 {index + 1}</legend>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-xs text-accent">成果指标 {index + 1}</p>
                    <RowActions
                      label={`成果指标 ${index + 1}`}
                      index={index}
                      count={metrics.length}
                      onMove={(from, to) => onMetricsChange(moveRow(metrics, from, to))}
                      onRemove={() => removeMetric(index)}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <EvidenceInput
                      id={`${prefix}-label`}
                      label="指标名称"
                      value={metric.label}
                      error={errors[`${prefix}-label`]}
                      placeholder="例如：核心接口 P95"
                      required
                      maxLength={120}
                      onChange={(label) =>
                        onMetricsChange(metrics.map((row, i) => (i === index ? { ...row, label } : row)))
                      }
                    />
                    <EvidenceInput
                      id={`${prefix}-value`}
                      label="结果值"
                      value={metric.value}
                      error={errors[`${prefix}-value`]}
                      placeholder="例如：780ms → 210ms"
                      required
                      maxLength={120}
                      onChange={(value) =>
                        onMetricsChange(metrics.map((row, i) => (i === index ? { ...row, value } : row)))
                      }
                    />
                  </div>
                  <div className="mt-3">
                    <EvidenceTextarea
                      id={`${prefix}-context`}
                      label="口径与背景"
                      value={metric.context}
                      placeholder="测试环境、样本量或你实际负责的范围"
                      maxLength={500}
                      rows={2}
                      onChange={(context) =>
                        onMetricsChange(
                          metrics.map((row, i) => (i === index ? { ...row, context } : row)),
                        )
                      }
                    />
                  </div>
                  <details className="mt-4 border-t border-line pt-3">
                    <summary className="text-sm text-ink-muted">补充英文版本（可选）</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <EvidenceInput
                        id={`${prefix}-label-en`}
                        label="Metric label (EN)"
                        value={metric.labelEn}
                        maxLength={120}
                        onChange={(labelEn) =>
                          onMetricsChange(
                            metrics.map((row, i) => (i === index ? { ...row, labelEn } : row)),
                          )
                        }
                      />
                      <EvidenceInput
                        id={`${prefix}-value-en`}
                        label="Metric value (EN)"
                        value={metric.valueEn}
                        maxLength={120}
                        onChange={(valueEn) =>
                          onMetricsChange(
                            metrics.map((row, i) => (i === index ? { ...row, valueEn } : row)),
                          )
                        }
                      />
                      <div className="md:col-span-2">
                        <EvidenceTextarea
                          id={`${prefix}-context-en`}
                          label="Context (EN)"
                          value={metric.contextEn}
                          maxLength={500}
                          rows={2}
                          onChange={(contextEn) =>
                            onMetricsChange(
                              metrics.map((row, i) =>
                                i === index ? { ...row, contextEn } : row,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  </details>
                </fieldset>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="project-decisions-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="project-decisions-title" className="font-display text-lg text-ink">
              技术取舍
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              记录关键选择以及付出的代价。这部分最适合在面试中展开讨论。
            </p>
          </div>
          <Button
            id="add-project-decision"
            type="button"
            variant="ghost"
            disabled={decisions.length >= 20}
            onClick={addDecision}
          >
            {decisions.length >= 20 ? "最多 20 项" : "添加取舍"}
          </Button>
        </div>

        {decisions.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-bg-soft p-4 text-sm text-ink-faint">
            还没有技术取舍。可以从“为什么不用更常见的方案”开始写。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {decisions.map((decision, index) => {
              const prefix = `decision-${decision.key}`;
              return (
                <fieldset
                  key={decision.key}
                  className="evidence-row rounded-xl border border-line bg-bg-soft p-4"
                >
                  <legend className="sr-only">技术取舍 {index + 1}</legend>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-xs text-accent">技术取舍 {index + 1}</p>
                    <RowActions
                      label={`技术取舍 ${index + 1}`}
                      index={index}
                      count={decisions.length}
                      onMove={(from, to) => onDecisionsChange(moveRow(decisions, from, to))}
                      onRemove={() => removeDecision(index)}
                    />
                  </div>
                  <EvidenceInput
                    id={`${prefix}-title`}
                    label="选择"
                    value={decision.title}
                    error={errors[`${prefix}-title`]}
                    placeholder="例如：采用 SQLite 作为单机内容库"
                    required
                    maxLength={160}
                    onChange={(title) =>
                      onDecisionsChange(
                        decisions.map((row, i) => (i === index ? { ...row, title } : row)),
                      )
                    }
                  />
                  <div className="mt-3">
                    <EvidenceTextarea
                      id={`${prefix}-tradeoff`}
                      label="收益与代价"
                      value={decision.tradeoff}
                      error={errors[`${prefix}-tradeoff`]}
                      placeholder="说明为什么适合当时的约束，以及放弃了什么"
                      required
                      maxLength={1200}
                      onChange={(tradeoff) =>
                        onDecisionsChange(
                          decisions.map((row, i) => (i === index ? { ...row, tradeoff } : row)),
                        )
                      }
                    />
                  </div>
                  <details className="mt-4 border-t border-line pt-3">
                    <summary className="text-sm text-ink-muted">补充英文版本（可选）</summary>
                    <div className="mt-3 space-y-3">
                      <EvidenceInput
                        id={`${prefix}-title-en`}
                        label="Decision (EN)"
                        value={decision.titleEn}
                        maxLength={160}
                        onChange={(titleEn) =>
                          onDecisionsChange(
                            decisions.map((row, i) => (i === index ? { ...row, titleEn } : row)),
                          )
                        }
                      />
                      <EvidenceTextarea
                        id={`${prefix}-tradeoff-en`}
                        label="Trade-off (EN)"
                        value={decision.tradeoffEn}
                        maxLength={1200}
                        onChange={(tradeoffEn) =>
                          onDecisionsChange(
                            decisions.map((row, i) =>
                              i === index ? { ...row, tradeoffEn } : row,
                            ),
                          )
                        }
                      />
                    </div>
                  </details>
                </fieldset>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="project-gallery-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="project-gallery-title" className="font-display text-lg text-ink">
              证据画廊
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              添加界面、架构图或监控截图。替代文本应说明图片证明了什么，而不是只写“截图”。
            </p>
          </div>
          <Button
            id="add-project-gallery"
            type="button"
            variant="ghost"
            disabled={gallery.length >= 30}
            onClick={addGalleryImage}
          >
            {gallery.length >= 30 ? "最多 30 张" : "添加图片"}
          </Button>
        </div>

        {gallery.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line bg-bg-soft p-4 text-sm text-ink-faint">
            还没有证据图片。可先添加最能代表最终结果的一张，再补过程材料。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {gallery.map((image, index) => {
              const prefix = `gallery-${image.key}`;
              return (
                <fieldset
                  key={image.key}
                  className="evidence-row rounded-xl border border-line bg-bg-soft p-4"
                >
                  <legend className="sr-only">证据图片 {index + 1}</legend>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-xs text-accent">证据图片 {index + 1}</p>
                    <RowActions
                      label={`证据图片 ${index + 1}`}
                      index={index}
                      count={gallery.length}
                      onMove={(from, to) => onGalleryChange(moveRow(gallery, from, to))}
                      onRemove={() => removeGalleryImage(index)}
                    />
                  </div>
                  <ImageUploadField
                    id={`${prefix}-src`}
                    label="图片地址 *"
                    value={image.src}
                    error={errors[`${prefix}-src`]}
                    hint="支持站内 /uploads/... 路径或 HTTPS 地址。"
                    onChange={(src) =>
                      onGalleryChange(
                        gallery.map((row, i) => (i === index ? { ...row, src } : row)),
                      )
                    }
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <EvidenceInput
                      id={`${prefix}-alt`}
                      label="替代文本"
                      value={image.alt}
                      error={errors[`${prefix}-alt`]}
                      placeholder="例如：展示请求链路与缓存层的系统架构图"
                      required
                      maxLength={300}
                      onChange={(alt) =>
                        onGalleryChange(
                          gallery.map((row, i) => (i === index ? { ...row, alt } : row)),
                        )
                      }
                    />
                    <EvidenceInput
                      id={`${prefix}-caption`}
                      label="图片说明"
                      value={image.caption}
                      placeholder="可补充时间、场景或结果"
                      maxLength={500}
                      onChange={(caption) =>
                        onGalleryChange(
                          gallery.map((row, i) => (i === index ? { ...row, caption } : row)),
                        )
                      }
                    />
                  </div>
                  <details className="mt-4 border-t border-line pt-3">
                    <summary className="text-sm text-ink-muted">补充英文版本（可选）</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <EvidenceInput
                        id={`${prefix}-alt-en`}
                        label="Alt text (EN)"
                        value={image.altEn}
                        maxLength={300}
                        onChange={(altEn) =>
                          onGalleryChange(
                            gallery.map((row, i) => (i === index ? { ...row, altEn } : row)),
                          )
                        }
                      />
                      <EvidenceInput
                        id={`${prefix}-caption-en`}
                        label="Caption (EN)"
                        value={image.captionEn}
                        maxLength={500}
                        onChange={(captionEn) =>
                          onGalleryChange(
                            gallery.map((row, i) => (i === index ? { ...row, captionEn } : row)),
                          )
                        }
                      />
                    </div>
                  </details>
                </fieldset>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
