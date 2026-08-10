"use client";

import { useState, type FormEvent } from "react";
import { translate, type Locale } from "@/lib/i18n";

export function ContactForm({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, body, company }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setDone(true);
      setName("");
      setEmail("");
      setSubject("");
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
        <p className="font-display text-xl text-ink">{t("contact.thanks")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-busy={busy}>
      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="contact-name" className="block text-sm">
          <span className="text-ink-faint">{t("contact.name")}</span>
          <input
            id="contact-name"
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
        <label htmlFor="contact-email" className="block text-sm">
          <span className="text-ink-faint">{t("contact.email")}</span>
          <input
            id="contact-email"
            name="email"
            required
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
      <label htmlFor="contact-subject" className="block text-sm">
        <span className="text-ink-faint">{t("contact.subject")}</span>
        <input
          id="contact-subject"
          name="subject"
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink"
        />
      </label>
      <label htmlFor="contact-message" className="block text-sm">
        <span className="text-ink-faint">{t("contact.message")}</span>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={2}
          maxLength={5000}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-bg-soft px-3 py-2 text-ink"
        />
      </label>
      {/* honeypot */}
      <label className="hidden" aria-hidden>
        company
        <input
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? (locale === "zh" ? "发送中…" : "Sending…") : t("contact.submit")}
      </button>
    </form>
  );
}
