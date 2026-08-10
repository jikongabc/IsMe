"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/admin/Field";
import type { MediaItem } from "@/lib/media/uploads";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibrary({ initial }: { initial: MediaItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      setMessage(`uploaded ${data.url}`);
      router.refresh();
      const list = await fetch("/api/admin/media");
      const payload = await list.json();
      setItems(payload.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "delete failed");
      setItems((prev) => prev.filter((item) => item.name !== name));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`copied ${url}`);
    } catch {
      setMessage(url);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-primary cursor-pointer !py-2 text-xs">
          {busy ? "working…" : "upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0] ?? null)}
          />
        </label>
        <span className="text-xs text-ink-faint">{items.length} files</span>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-accent">{message}</p> : null}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted"># uploads empty — drop an image above</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.name} className="terminal-window overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.name}
                className="h-36 w-full object-cover"
              />
              <div className="space-y-2 p-3">
                <div className="truncate font-mono text-xs text-ink">{item.name}</div>
                <div className="text-xs text-ink-faint">
                  {formatBytes(item.bytes)} · {item.modifiedAt.slice(0, 10)}
                  {item.storage ? ` · ${item.storage}` : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => void copyUrl(item.url)}>
                    copy url
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void remove(item.name)}
                  >
                    rm
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
