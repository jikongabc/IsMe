"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/admin/Field";
import type { ContactMessage } from "@/lib/db/schema";

export function ContactAdmin({ initial }: { initial: ContactMessage[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: "unread" | "read" | "archived") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("failed");
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contact?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("failed");
      setItems((prev) => prev.filter((row) => row.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted"># inbox empty</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="terminal-window space-y-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-display text-lg text-ink">{item.subject}</span>
                  <div className="text-xs text-ink-faint">
                    {item.name} · {item.email}
                  </div>
                </div>
                <span className="font-mono text-xs text-accent">{item.status}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-muted">{item.body}</p>
              <div className="font-mono text-xs text-ink-faint">
                {item.createdAt.replace("T", " ").slice(0, 19)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || item.status === "read"}
                  onClick={() => void setStatus(item.id, "read")}
                >
                  mark read
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void setStatus(item.id, "archived")}
                >
                  archive
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void remove(item.id)}
                >
                  rm
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
