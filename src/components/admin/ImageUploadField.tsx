"use client";

import { useEffect, useId, useState } from "react";
import { Button, Input, Label } from "@/components/admin/Field";
import type { MediaItem } from "@/lib/media/uploads";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  id?: string;
  error?: string;
  hint?: string;
};

export function ImageUploadField({ label, value, onChange, id, error: fieldError, hint }: Props) {
  const generatedId = useId();
  const inputId = id ?? `image-${generatedId}`;
  const libraryId = `${inputId}-library`;
  const helpId = hint ? `${inputId}-hint` : undefined;
  const errorId = fieldError ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  useEffect(() => {
    if (!libraryOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/media");
        if (!res.ok) throw new Error("media library request failed");
        const data = await res.json();
        if (!cancelled) setLibrary(data.items ?? []);
      } catch {
        if (!cancelled) {
          setLibrary([]);
          setLibraryError("媒体库加载失败，请关闭后重试。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryOpen]);

  async function onFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function toggleLibrary() {
    if (!libraryOpen) setLibraryError(null);
    setLibraryOpen((value) => !value);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      {hint ? (
        <p id={helpId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/uploads/..."
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={describedBy}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-ghost cursor-pointer !py-1.5 text-xs focus-within:outline focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-accent">
          {uploading ? "上传中…" : "上传图片"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading}
            aria-label={`上传${label}`}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={libraryOpen}
          aria-controls={libraryId}
          onClick={toggleLibrary}
        >
          {libraryOpen ? "收起媒体库" : "从媒体库选择"}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange("")}>
            清除
          </Button>
        ) : null}
      </div>
      {libraryOpen ? (
        <div id={libraryId} className="max-h-48 overflow-auto border border-dashed border-line p-2">
          {libraryError ? (
            <p className="text-xs text-danger" role="alert">
              {libraryError}
            </p>
          ) : library.length === 0 ? (
            <p className="text-xs text-ink-faint">媒体库为空</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {library.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    className="w-full border border-transparent hover:border-accent"
                    onClick={() => {
                      onChange(item.url);
                      setLibraryOpen(false);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={item.name} className="h-16 w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={`${label}预览`}
          className="mt-2 max-h-28 border border-line object-cover"
        />
      ) : null}
      {fieldError ? (
        <p id={errorId} className="text-xs text-danger">
          {fieldError}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
