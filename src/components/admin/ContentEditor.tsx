"use client";

import { useId } from "react";
import { RichContent } from "@/components/content/RichContent";
import { Label, Select, Textarea } from "@/components/admin/Field";
import type { ContentFormat } from "@/lib/content/format";

type Props = {
  label?: string;
  value: string;
  format: ContentFormat;
  onChange: (value: string) => void;
  onFormatChange?: (format: ContentFormat) => void;
  rows?: number;
  /** When false, format is display-only (e.g. EN body sharing primary format). */
  showFormatSelect?: boolean;
};

export function ContentEditor({
  label = "content",
  value,
  format,
  onChange,
  onFormatChange,
  rows = 14,
  showFormatSelect = true,
}: Props) {
  const generatedId = useId();
  const textareaId = `content-editor-${generatedId}`;
  const preview = value.trim() ? (
    <RichContent
      content={value}
      format={format}
      className="prose-isme text-sm"
    />
  ) : (
    <p className="text-sm text-ink-faint">暂无内容，在编辑框输入后即可预览。</p>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Label htmlFor={textareaId}>{label}</Label>
        {showFormatSelect && onFormatChange ? (
          <div className="w-40">
            <Select
              aria-label={`${label} format`}
              value={format}
              onChange={(e) => onFormatChange(e.target.value as ContentFormat)}
            >
              <option value="markdown">markdown</option>
              <option value="html">html</option>
            </Select>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">{format}</p>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Textarea
          id={textareaId}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[280px] font-mono text-xs"
          placeholder={format === "html" ? "<p>hello</p>" : "# hello"}
        />
        <div
          className="terminal-window hidden min-h-[280px] overflow-auto p-4 lg:block"
          aria-label={`${label} preview`}
        >
          <p className="mb-3 text-xs text-ink-faint">内容预览 · {format}</p>
          {preview}
        </div>
        <details className="terminal-window lg:hidden">
          <summary className="px-4 py-3 text-sm font-semibold text-ink-muted">
            预览内容 · {format}
          </summary>
          <div className="border-t border-line p-4" aria-label={`${label} preview`}>
            {preview}
          </div>
        </details>
      </div>
    </div>
  );
}
