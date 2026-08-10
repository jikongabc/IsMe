"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/i18n/locales";

export function PageViewBeacon({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const key = `${pathname}:${locale}`;
    if (lastSent.current === key) return;
    lastSent.current = key;

    const payload = JSON.stringify({
      path: pathname,
      referrer: typeof document !== "undefined" ? document.referrer : "",
      locale,
    });

    try {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/pageview", blob);
        return;
      }
    } catch {
      // fall through to fetch
    }

    void fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // ignore
    });
  }, [pathname, locale]);

  return null;
}
