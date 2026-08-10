"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useTransition } from "react";
import { THEME_META, type SiteTheme } from "@/lib/theme";

export function ThemeSwitcher({
  theme,
  enabledThemes,
  label = "theme",
}: {
  theme: SiteTheme;
  enabledThemes: SiteTheme[];
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setOptimisticTheme] = useOptimistic(theme);
  const options = enabledThemes.length > 0 ? enabledThemes : [theme];

  useEffect(() => {
    document.documentElement.dataset.theme = active;
  }, [active]);

  function setTheme(next: SiteTheme) {
    if (next === active || pending) return;
    startTransition(async () => {
      setOptimisticTheme(next);
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      router.refresh();
    });
  }

  if (options.length <= 1) return null;

  return (
    <label className="switcher-control">
      <span className="sr-only">{label}</span>
      <select
        value={active}
        disabled={pending}
        aria-label={label}
        onChange={(event) => setTheme(event.target.value as SiteTheme)}
      >
        {options.map((id) => (
          <option key={id} value={id}>
            {THEME_META[id].short}
          </option>
        ))}
      </select>
    </label>
  );
}
