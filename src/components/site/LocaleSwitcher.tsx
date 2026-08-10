"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function setLocale(next: Locale) {
    if (next === locale || pending) return;
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="locale-switcher" role="group" aria-label="Language">
      <button
        type="button"
        disabled={pending}
        onClick={() => void setLocale("zh")}
        className={locale === "zh" ? "active" : ""}
        aria-pressed={locale === "zh"}
      >
        {LOCALE_LABELS.zh}
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => void setLocale("en")}
        className={locale === "en" ? "active" : ""}
        aria-pressed={locale === "en"}
      >
        {LOCALE_LABELS.en}
      </button>
    </div>
  );
}
