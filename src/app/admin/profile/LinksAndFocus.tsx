"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Textarea } from "@/components/admin/Field";
import type { FocusArea, SocialLink } from "@/lib/db/schema";

export function LinksAndFocus({
  links,
  areas,
}: {
  links: SocialLink[];
  areas: FocusArea[];
}) {
  const router = useRouter();
  const [linkForm, setLinkForm] = useState({
    platform: "github",
    label: "",
    url: "",
    sortOrder: 0,
  });
  const [areaForm, setAreaForm] = useState({
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    tags: "",
    sortOrder: 0,
  });
  const [error, setError] = useState<string | null>(null);

  async function requireOk(response: Response) {
    if (response.ok) return;
    const data = await response.json().catch(() => ({}));
    const detail = data.error?.formErrors?.[0] || data.error || "request failed";
    throw new Error(typeof detail === "string" ? detail : "request failed");
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/admin/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...linkForm, visible: true }),
      });
      await requireOk(response);
      setLinkForm({ platform: "github", label: "", url: "", sortOrder: 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "link could not be saved");
    }
  }

  async function removeLink(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/social-links?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await requireOk(response);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "link could not be removed");
    }
  }

  async function addArea(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/admin/focus-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...areaForm,
          tags: areaForm.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          visible: true,
        }),
      });
      await requireOk(response);
      setAreaForm({
        title: "",
        titleEn: "",
        description: "",
        descriptionEn: "",
        tags: "",
        sortOrder: 0,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "focus area could not be saved");
    }
  }

  async function removeArea(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/focus-areas?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await requireOk(response);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "focus area could not be removed");
    }
  }

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-2">
      {error ? (
        <p className="lg:col-span-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-accent">social_links[]</h2>
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 border border-line px-3 py-2 text-sm"
            >
              <span>
                {link.label} <span className="text-ink-faint">{link.url}</span>
              </span>
              <Button type="button" variant="danger" onClick={() => void removeLink(link.id)}>
                rm
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={addLink} className="space-y-2 border border-line p-3">
          <Label>label / url</Label>
          <Input
            placeholder="GitHub"
            value={linkForm.label}
            onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))}
            required
          />
          <Input
            placeholder="https://github.com/you"
            value={linkForm.url}
            onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
            required
          />
          <Button type="submit">add link</Button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl text-accent">focus_areas[]</h2>
        <ul className="space-y-2">
          {areas.map((area) => (
            <li
              key={area.id}
              className="flex items-center justify-between gap-3 border border-line px-3 py-2 text-sm"
            >
              <span>
                {area.title}
                {area.titleEn ? (
                  <span className="text-ink-faint"> · {area.titleEn}</span>
                ) : null}
              </span>
              <Button type="button" variant="danger" onClick={() => void removeArea(area.id)}>
                rm
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={addArea} className="space-y-2 border border-line p-3">
          <Input
            placeholder="title"
            value={areaForm.title}
            onChange={(e) => setAreaForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            placeholder="title (en)"
            value={areaForm.titleEn}
            onChange={(e) => setAreaForm((f) => ({ ...f, titleEn: e.target.value }))}
          />
          <Textarea
            rows={3}
            placeholder="description"
            value={areaForm.description}
            onChange={(e) => setAreaForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Textarea
            rows={3}
            placeholder="description (en)"
            value={areaForm.descriptionEn}
            onChange={(e) => setAreaForm((f) => ({ ...f, descriptionEn: e.target.value }))}
          />
          <Input
            placeholder="tags, comma separated"
            value={areaForm.tags}
            onChange={(e) => setAreaForm((f) => ({ ...f, tags: e.target.value }))}
          />
          <Button type="submit">add focus</Button>
        </form>
      </section>
    </div>
  );
}
