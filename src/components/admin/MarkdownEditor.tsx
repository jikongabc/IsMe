"use client";

import ReactMarkdown from "react-markdown";
import { Label, Textarea } from "@/components/admin/Field";

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
};

export function MarkdownEditor({ value, onChange, rows = 14 }: Props) {
  return (
    <div className="space-y-2">
      <Label>content (markdown)</Label>
      <div className="grid gap-3 lg:grid-cols-2">
        <Textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[280px] font-mono text-xs"
        />
        <div className="terminal-window min-h-[280px] overflow-auto p-4">
          <p className="mb-3 text-xs text-ink-faint">preview://</p>
          {value.trim() ? (
            <div className="prose-isme text-sm">
              <ReactMarkdown>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-ink-faint"># empty — type markdown on the left</p>
          )}
        </div>
      </div>
    </div>
  );
}
