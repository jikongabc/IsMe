"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { Button, Input, Label, Select } from "@/components/admin/Field";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import type { ContentFormat } from "@/lib/content/format";
import type { BlogPost } from "@/lib/db/schema";

type FormState = {
  id?: string;
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  excerptEn: string;
  contentMarkdown: string;
  contentEn: string;
  contentFormat: ContentFormat;
  coverUrl: string;
  category: string;
  tags: string;
  status: string;
  seoTitle: string;
  seoDescription: string;
};

const empty: FormState = {
  title: "",
  titleEn: "",
  slug: "",
  excerpt: "",
  excerptEn: "",
  contentMarkdown: "",
  contentEn: "",
  contentFormat: "markdown",
  coverUrl: "",
  category: "",
  tags: "",
  status: "draft",
  seoTitle: "",
  seoDescription: "",
};

function toForm(post: BlogPost): FormState {
  return {
    id: post.id,
    title: post.title,
    titleEn: post.titleEn ?? "",
    slug: post.slug,
    excerpt: post.excerpt,
    excerptEn: post.excerptEn ?? "",
    contentMarkdown: post.contentMarkdown,
    contentEn: post.contentEn ?? "",
    contentFormat: post.contentFormat === "html" ? "html" : "markdown",
    coverUrl: post.coverUrl,
    category: post.category,
    tags: (post.tags ?? []).join(", "),
    status: post.status,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
  };
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function PostsManager({ initial }: { initial: BlogPost[] }) {
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
        tags: parseTags(form.tags),
      };
      const res = await fetch("/api/admin/posts", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed — check slug / fields");
      setForm(empty);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/posts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (form.id === id) setForm(empty);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {initial.map((item) => (
          <li
            key={item.id}
            className="terminal-window flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <div className="text-ink">{item.title}</div>
              <div className="text-xs text-ink-faint">
                /{item.slug} · {item.status} · {item.contentFormat || "markdown"}
                {item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}
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
        <h2 className="font-display text-xl text-accent">
          {form.id ? "patch post" : "new post"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>title (en)</Label>
            <Input
              value={form.titleEn}
              onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
            />
          </div>
          <div>
            <Label>slug</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>status</Label>
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </Select>
          </div>
          <div>
            <Label>category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
          <div>
            <Label>tags (comma separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="rag, portfolio"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>excerpt</Label>
            <Input
              value={form.excerpt}
              onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
            />
          </div>
          <div>
            <Label>excerpt (en)</Label>
            <Input
              value={form.excerptEn}
              onChange={(e) => setForm((f) => ({ ...f, excerptEn: e.target.value }))}
            />
          </div>
        </div>
        <ImageUploadField
          label="cover"
          value={form.coverUrl}
          onChange={(url) => setForm((f) => ({ ...f, coverUrl: url }))}
        />
        <ContentEditor
          label="body"
          value={form.contentMarkdown}
          format={form.contentFormat}
          onChange={(contentMarkdown) => setForm((f) => ({ ...f, contentMarkdown }))}
          onFormatChange={(contentFormat) => setForm((f) => ({ ...f, contentFormat }))}
        />
        <ContentEditor
          label="body (en)"
          value={form.contentEn}
          format={form.contentFormat}
          onChange={(contentEn) => setForm((f) => ({ ...f, contentEn }))}
          showFormatSelect={false}
          rows={10}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>seo title</Label>
            <Input
              value={form.seoTitle}
              onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
            />
          </div>
          <div>
            <Label>seo description</Label>
            <Input
              value={form.seoDescription}
              onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
            />
          </div>
        </div>
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
