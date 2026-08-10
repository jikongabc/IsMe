"use client";

import { useState } from "react";
import { Button, Input, Label, Textarea } from "@/components/admin/Field";
import { ImageUploadField } from "@/components/admin/ImageUploadField";

type ProfileValues = {
  siteName: string;
  displayName: string;
  englishName: string;
  role: string;
  roleEn: string;
  headline: string;
  headlineEn: string;
  introduction: string;
  introductionEn: string;
  avatarUrl: string;
  location: string;
  publicEmail: string;
  availability: string;
  availabilityEn: string;
};

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      setMessage("saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {(
        [
          ["siteName", "site name"],
          ["displayName", "display name"],
          ["englishName", "english name"],
          ["role", "role"],
          ["roleEn", "role (en)"],
          ["headline", "headline"],
          ["headlineEn", "headline (en)"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <Label>{label}</Label>
          <Input value={values[key]} onChange={(e) => set(key, e.target.value)} />
        </div>
      ))}
      <div>
        <Label>introduction</Label>
        <Textarea
          rows={6}
          value={values.introduction}
          onChange={(e) => set("introduction", e.target.value)}
        />
      </div>
      <div>
        <Label>introduction (en)</Label>
        <Textarea
          rows={6}
          value={values.introductionEn}
          onChange={(e) => set("introductionEn", e.target.value)}
        />
      </div>
      <ImageUploadField
        label="avatar"
        value={values.avatarUrl}
        onChange={(url) => set("avatarUrl", url)}
      />
      {(
        [
          ["location", "location"],
          ["publicEmail", "public email"],
          ["availability", "availability"],
          ["availabilityEn", "availability (en)"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <Label>{label}</Label>
          <Input value={values[key]} onChange={(e) => set(key, e.target.value)} />
        </div>
      ))}
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "saving…" : "save profile"}
      </Button>
    </form>
  );
}
