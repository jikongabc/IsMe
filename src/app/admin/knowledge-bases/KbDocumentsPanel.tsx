"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/admin/Field";

type Doc = { name: string; sha256: string };
type Job = {
  jobId: string;
  status: string;
  message: string | null;
  documentCount?: number | null;
  chunkCount?: number | null;
  errorCode?: string | null;
};
type SyncResult = {
  demo: boolean;
  total: number;
  created: number;
  approved: number;
  deduplicated: number;
  removed: number;
  failed: number;
  items: Array<{ key: string; title: string; status: string; error?: string }>;
};

type Props = {
  moduleId: string;
  moduleName: string;
  cogdocKbId: string;
};

export function KbDocumentsPanel({ moduleId, moduleName, cogdocKbId }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [health, setHealth] = useState<string>("…");
  const [job, setJob] = useState<Job | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDocs = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/knowledge-bases/${moduleId}/documents`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "failed to list documents");
      setDocs([]);
      return;
    }
    setDocs(data.documents ?? []);
  }, [moduleId]);

  const checkHealth = useCallback(async () => {
    const res = await fetch("/api/admin/cogdoc/health");
    const data = await res.json();
    if (data.demo) {
      setHealth("demo — COGDOC_API_URL empty");
    } else if (data.ok) {
      setHealth("online");
    } else {
      setHealth(`offline — ${data.detail || data.status || "?"}`);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkHealth();
      void loadDocs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkHealth, loadDocs]);

  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    const timer = setInterval(async () => {
      const res = await fetch(
        `/api/admin/knowledge-bases/${moduleId}/jobs/${encodeURIComponent(job.jobId)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "job poll failed");
        return;
      }
      setJob(data.job);
      if (data.job.status === "succeeded") {
        void loadDocs();
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job, moduleId, loadDocs]);

  async function syncKb() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/knowledge-bases/${moduleId}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "sync failed");
      setJob({
        jobId: "sync",
        status: "succeeded",
        message: data.created
          ? `created cogdoc kb \`${data.kb.kbId}\``
          : `bound existing kb \`${data.kb.kbId}\` (${data.kb.documentCount} docs)`,
      });
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/knowledge-bases/${moduleId}/documents`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(name: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/knowledge-bases/${moduleId}/documents?name=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "delete failed");
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function syncContent() {
    setBusy(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/admin/knowledge-bases/${moduleId}/sync-content`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "content sync failed");
      setSyncResult(data.result);
      setJob({
        jobId: "sync-content",
        status: data.result.failed ? "failed" : "succeeded",
        message: data.result.demo
          ? `demo synced ${data.result.total} cards (no cogdoc)`
          : `synced ${data.result.approved} approved / ${data.result.deduplicated} unchanged / ${data.result.removed} stale removed / ${data.result.failed} failed`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "content sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="terminal-window space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-accent">docs://{moduleName}</h2>
          <p className="mt-1 text-xs text-ink-faint">
            cogdoc kb: <span className="text-ink-muted">{cogdocKbId || "(unbound)"}</span>
            {" · "}
            health: <span className="text-ink-muted">{health}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => void checkHealth()} disabled={busy}>
            ping
          </Button>
          <Button type="button" variant="ghost" onClick={() => void loadDocs()} disabled={busy}>
            refresh
          </Button>
          <Button type="button" variant="ghost" onClick={() => void syncKb()} disabled={busy || !cogdocKbId}>
            sync kb
          </Button>
          <Button type="button" onClick={() => void syncContent()} disabled={busy || !cogdocKbId}>
            sync site content
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        sync site content → reconcile IsMe-managed profile / experience / projects / posts; manual CogDoc knowledge is preserved
      </p>

      <div className="flex flex-wrap items-center gap-3 border border-dashed border-line p-3">
        <label className="btn-ghost cursor-pointer !py-1.5 text-xs">
          {busy ? "working…" : "upload pdf"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={busy || !cogdocKbId}
            onChange={(e) => void upload(e.target.files?.[0] ?? null)}
          />
        </label>
        <span className="text-xs text-ink-faint">pdf only · ingest runs on cogdoc</span>
      </div>

      {job ? (
        <div className="border border-line bg-bg-soft px-3 py-2 text-xs text-ink-muted">
          <span className="text-accent-2">job</span> {job.jobId} ·{" "}
          <span className={job.status === "failed" ? "text-danger" : "text-accent"}>
            {job.status}
          </span>
          {job.message ? ` — ${job.message}` : ""}
          {job.chunkCount != null ? ` · chunks=${job.chunkCount}` : ""}
          {job.documentCount != null ? ` · docs=${job.documentCount}` : ""}
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {syncResult ? (
        <div className="space-y-2 border border-line p-3">
          <p className="text-xs text-accent-2">
            content_sync{syncResult.demo ? " (demo)" : ""} · total={syncResult.total} ·
            approved={syncResult.approved} · unchanged={syncResult.deduplicated} · stale removed=
            {syncResult.removed} · failed={syncResult.failed}
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-ink-muted">
            {syncResult.items.map((item) => (
              <li key={item.key}>
                <span className="text-ink-faint">[{item.status}]</span> {item.title}
                {item.error ? <span className="text-danger"> — {item.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-2">
        {docs.length === 0 ? (
          <li className="text-sm text-ink-faint"># no indexed documents yet</li>
        ) : (
          docs.map((doc) => (
            <li
              key={doc.name}
              className="flex flex-wrap items-center justify-between gap-3 border border-line px-3 py-2 text-sm"
            >
              <div>
                <div className="text-ink">{doc.name}</div>
                <div className="text-xs text-ink-faint">
                  sha256: {doc.sha256 ? `${doc.sha256.slice(0, 12)}…` : "n/a"}
                </div>
              </div>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => void removeDoc(doc.name)}
              >
                rm
              </Button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
