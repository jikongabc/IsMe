"use client";

import { useState, type FormEvent } from "react";
import { translate, type Locale } from "@/lib/i18n";

export function GuestbookForm({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, body, website }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setDone(true);
      setName("");
      setEmail("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent-soft p-5" role="status">
        <p className="font-display text-xl text-ink">{t("guestbook.thanks")}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="portfolio-card space-y-5"
      aria-busy={busy}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="guestbook-name" className="block text-sm">
          <span className="text-ink-faint">{t("guestbook.name")}</span>
          <input
            id="guestbook-name"
            name="name"
            required
            maxLength={80}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink"
          />
        </label>
        <label htmlFor="guestbook-email" className="block text-sm">
          <span className="text-ink-faint">{t("guestbook.email")}</span>
          <input
            id="guestbook-email"
            name="email"
            type="email"
            maxLength={200}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink"
          />
        </label>
      </div>
      <label htmlFor="guestbook-message" className="block text-sm">
        <span className="text-ink-faint">{t("guestbook.message")}</span>
        <textarea
          id="guestbook-message"
          name="message"
          required
          minLength={2}
          maxLength={2000}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink"
        />
      </label>
      {/* honeypot */}
      <label className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn-primary text-sm">
        {busy ? (locale === "zh" ? "提交中…" : "Submitting…") : t("guestbook.submit")}
      </button>
    </form>
  );
}
