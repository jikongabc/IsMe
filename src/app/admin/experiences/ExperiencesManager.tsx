"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/admin/Field";
import type { Experience } from "@/lib/db/schema";

type FormState = {
  id?: string;
  type: string;
  organization: string;
  organizationEn: string;
  role: string;
  roleEn: string;
  startDate: string;
  endDate: string;
  description: string;
  descriptionEn: string;
  skills: string;
  sortOrder: number;
  visible: boolean;
};

const empty: FormState = {
  type: "work",
  organization: "",
  organizationEn: "",
  role: "",
  roleEn: "",
  startDate: "",
  endDate: "",
  description: "",
  descriptionEn: "",
  skills: "",
  sortOrder: 0,
  visible: true,
};

function toForm(item: Experience): FormState {
  return {
    id: item.id,
    type: item.type,
    organization: item.organization,
    organizationEn: item.organizationEn ?? "",
    role: item.role,
    roleEn: item.roleEn ?? "",
    startDate: item.startDate,
    endDate: item.endDate,
    description: item.description,
    descriptionEn: item.descriptionEn ?? "",
    skills: (item.skills ?? []).join(", "),
    sortOrder: item.sortOrder,
    visible: item.visible,
  };
}

export function ExperiencesManager({ initial }: { initial: Experience[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        skills: form.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await fetch("/api/admin/experiences", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      setForm(empty);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/experiences?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (form.id === id) setForm(empty);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {initial.map((item) => (
          <li key={item.id} className="terminal-window flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="text-ink">
                {item.organization} · {item.role}
              </div>
              <div className="text-xs text-ink-faint">
                {item.type} · {item.visible ? "visible" : "hidden"}
                {item.organizationEn ? ` · en: ${item.organizationEn}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
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

      <form onSubmit={save} className="terminal-window space-y-3 p-4">
        <h2 className="font-display text-xl text-accent">{form.id ? "patch xp" : "add xp"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>type</Label>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="work">work</option>
              <option value="education">education</option>
              <option value="project">project</option>
              <option value="competition">competition</option>
              <option value="other">other</option>
            </Select>
          </div>
          <div>
            <Label>sort</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>organization</Label>
            <Input
              value={form.organization}
              onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>organization (en)</Label>
            <Input
              value={form.organizationEn}
              onChange={(e) => setForm((f) => ({ ...f, organizationEn: e.target.value }))}
            />
          </div>
          <div>
            <Label>role</Label>
            <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </div>
          <div>
            <Label>role (en)</Label>
            <Input
              value={form.roleEn}
              onChange={(e) => setForm((f) => ({ ...f, roleEn: e.target.value }))}
            />
          </div>
          <div>
            <Label>start</Label>
            <Input
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div>
            <Label>end</Label>
            <Input
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label>description</Label>
          <Textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <Label>description (en)</Label>
          <Textarea
            rows={4}
            value={form.descriptionEn}
            onChange={(e) => setForm((f) => ({ ...f, descriptionEn: e.target.value }))}
          />
        </div>
        <div>
          <Label>skills (comma)</Label>
          <Input
            value={form.skills}
            onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={form.visible}
            onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
          />
          visible
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
