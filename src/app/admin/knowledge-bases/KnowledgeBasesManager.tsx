"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Textarea } from "@/components/admin/Field";
import type { KnowledgeBaseModule } from "@/lib/db/schema";
import { KbDocumentsPanel } from "./KbDocumentsPanel";

type FormState = {
  id?: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  descriptionEn: string;
  cogdocKbId: string;
  welcomeMessage: string;
  welcomeMessageEn: string;
  suggestedQuestions: string;
  suggestedQuestionsEn: string;
  enabled: boolean;
  sortOrder: number;
};

const empty: FormState = {
  name: "",
  nameEn: "",
  slug: "",
  description: "",
  descriptionEn: "",
  cogdocKbId: "",
  welcomeMessage: "",
  welcomeMessageEn: "",
  suggestedQuestions: "",
  suggestedQuestionsEn: "",
  enabled: true,
  sortOrder: 0,
};

function toForm(item: KnowledgeBaseModule): FormState {
  return {
    id: item.id,
    name: item.name,
    nameEn: item.nameEn ?? "",
    slug: item.slug,
    description: item.description,
    descriptionEn: item.descriptionEn ?? "",
    cogdocKbId: item.cogdocKbId,
    welcomeMessage: item.welcomeMessage,
    welcomeMessageEn: item.welcomeMessageEn ?? "",
    suggestedQuestions: (item.suggestedQuestions ?? []).join("\n"),
    suggestedQuestionsEn: (item.suggestedQuestionsEn ?? []).join("\n"),
    enabled: item.enabled,
    sortOrder: item.sortOrder,
  };
}

export function KnowledgeBasesManager({ initial }: { initial: KnowledgeBaseModule[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(empty);
  const [docsForId, setDocsForId] = useState<string | null>(initial[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const docsModule = initial.find((item) => item.id === docsForId) ?? null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/knowledge-bases", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          suggestedQuestions: form.suggestedQuestions
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          suggestedQuestionsEn: form.suggestedQuestionsEn
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      if (!form.id && data.id) setDocsForId(data.id);
      setForm(empty);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/knowledge-bases?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (form.id === id) setForm(empty);
    if (docsForId === id) setDocsForId(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {initial.map((item) => (
          <li
            key={item.id}
            className={`terminal-window flex flex-wrap items-start justify-between gap-3 p-4 ${
              docsForId === item.id ? "border-accent" : ""
            }`}
          >
            <div>
              <div className="text-ink">{item.name}</div>
              <div className="text-xs text-ink-faint">
                slug:{item.slug} · kb:{item.cogdocKbId || "unbound"} ·{" "}
                {item.enabled ? "on" : "off"}
                {item.nameEn ? ` · en:${item.nameEn}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => setDocsForId(item.id)}>
                docs
              </Button>
              <Button type="button" variant="ghost" onClick={() => setForm(toForm(item))}>
                edit
              </Button>
              <Button type="button" variant="danger" onClick={() => void remove(item.id)}>
                rm
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {docsModule ? (
        <KbDocumentsPanel
          moduleId={docsModule.id}
          moduleName={docsModule.name}
          cogdocKbId={docsModule.cogdocKbId}
        />
      ) : (
        <p className="text-sm text-ink-faint"># select a module → docs to manage pdf ingest</p>
      )}

      <form onSubmit={save} className="terminal-window space-y-3 p-4">
        <h2 className="font-display text-xl text-accent">
          {form.id ? "patch kb module" : "new kb module"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>name (en)</Label>
            <Input
              value={form.nameEn}
              onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
            />
          </div>
          <div>
            <Label>public slug</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>cogdoc kb id</Label>
            <Input
              value={form.cogdocKbId}
              onChange={(e) => setForm((f) => ({ ...f, cogdocKbId: e.target.value }))}
              placeholder="portfolio-about"
            />
          </div>
          <div>
            <Label>sort</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <Label>description (en)</Label>
            <Input
              value={form.descriptionEn}
              onChange={(e) => setForm((f) => ({ ...f, descriptionEn: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label>welcome</Label>
          <Textarea
            rows={3}
            value={form.welcomeMessage}
            onChange={(e) => setForm((f) => ({ ...f, welcomeMessage: e.target.value }))}
          />
        </div>
        <div>
          <Label>welcome (en)</Label>
          <Textarea
            rows={3}
            value={form.welcomeMessageEn}
            onChange={(e) => setForm((f) => ({ ...f, welcomeMessageEn: e.target.value }))}
          />
        </div>
        <div>
          <Label>suggested questions (one per line)</Label>
          <Textarea
            rows={4}
            value={form.suggestedQuestions}
            onChange={(e) => setForm((f) => ({ ...f, suggestedQuestions: e.target.value }))}
          />
        </div>
        <div>
          <Label>suggested questions (en, one per line)</Label>
          <Textarea
            rows={4}
            value={form.suggestedQuestionsEn}
            onChange={(e) => setForm((f) => ({ ...f, suggestedQuestionsEn: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          enabled
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "saving…" : form.id ? "update" : "create"}
          </Button>
          {form.id ? (
            <Button type="button" variant="ghost" onClick={() => setForm(empty)}>
              cancel
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
