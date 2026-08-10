"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Label, Select } from "@/components/admin/Field";
import type { Locale } from "@/lib/i18n";
import {
  SITE_THEMES,
  THEME_META,
  themeOverrideStyle,
  type SiteTheme,
  type ThemeConfig,
} from "@/lib/theme";

export function AppearanceForm({
  initialTheme,
  initialLocale,
  initialConfig,
}: {
  initialTheme: SiteTheme;
  initialLocale: Locale;
  initialConfig: ThemeConfig;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<SiteTheme>(initialTheme);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [enabledThemes, setEnabledThemes] = useState<SiteTheme[]>(
    initialConfig.enabledThemes,
  );
  const [accent, setAccent] = useState(initialConfig.accent);
  const [accent2, setAccent2] = useState(initialConfig.accent2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const previewStyle = useMemo(
    () => themeOverrideStyle({ enabledThemes, accent, accent2 }),
    [enabledThemes, accent, accent2],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const keys = [
      "--accent",
      "--accent-2",
      "--accent-soft",
      "--atmosphere-a",
      "--atmosphere-b",
      "--btn-on-accent",
      "--line",
    ];
    if (!previewStyle) {
      for (const key of keys) root.style.removeProperty(key);
      return;
    }
    for (const [key, value] of Object.entries(previewStyle)) {
      root.style.setProperty(key, value);
    }
  }, [previewStyle]);

  function toggleEnabled(id: SiteTheme) {
    setEnabledThemes((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        if (id === theme) return prev;
        return prev.filter((item) => item !== id);
      }
      return SITE_THEMES.filter((item) => item === id || prev.includes(item));
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const enabled = enabledThemes.includes(theme)
        ? enabledThemes
        : [theme, ...enabledThemes];
      const res = await fetch("/api/admin/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          defaultLocale,
          enabledThemes: enabled,
          accent,
          accent2,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail =
          typeof data.error === "string"
            ? data.error
            : data.error?.formErrors?.[0] || "save failed";
        throw new Error(detail);
      }
      setEnabledThemes(enabled);
      setMessage(
        `theme → ${theme} · enabled ${enabled.length} · accent ${accent || "preset"}`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-xl text-accent">default theme</h2>
        <p className="mt-1 text-xs text-ink-faint">
          first-time visitors land here · cookie can override if the theme is enabled
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_THEMES.map((id) => {
            const meta = THEME_META[id];
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTheme(id);
                  if (!enabledThemes.includes(id)) {
                    setEnabledThemes((prev) =>
                      SITE_THEMES.filter((item) => item === id || prev.includes(item)),
                    );
                  }
                }}
                className={`terminal-window p-4 text-left transition ${
                  active ? "border-accent" : "hover:border-accent-2"
                }`}
              >
                <div className="text-xs text-ink-faint">theme/{meta.label}</div>
                <div className="mt-2 font-display text-xl text-ink">{meta.label}</div>
                <p className="mt-2 text-xs text-ink-muted">{meta.blurb}</p>
                <div className="mt-4 text-xs text-ink-faint">
                  {active ? "default" : "set as default"}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="terminal-window space-y-3 p-4">
        <h2 className="font-display text-xl text-accent">visitor switcher</h2>
        <p className="text-xs text-ink-faint">
          unchecked themes stay hidden in the public header · default must stay enabled
        </p>
        <div className="flex flex-wrap gap-2">
          {SITE_THEMES.map((id) => {
            const on = enabledThemes.includes(id);
            const locked = id === theme;
            return (
              <button
                key={id}
                type="button"
                disabled={locked && on}
                onClick={() => toggleEnabled(id)}
                className={`tag-chip transition ${
                  on ? "border-accent text-accent" : "opacity-60"
                }`}
                title={locked ? "default theme must stay enabled" : undefined}
              >
                {on ? "✓ " : ""}
                {THEME_META[id].short}
              </button>
            );
          })}
        </div>
      </section>

      <section className="terminal-window max-w-xl space-y-3 p-4">
        <h2 className="font-display text-xl text-accent">accent override</h2>
        <p className="text-xs text-ink-faint">
          optional brand colors · leave empty to use the preset palette · applies on every
          base theme
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>accent</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                aria-label="accent color picker"
                value={accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#3dff9a"}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-12 cursor-pointer border border-line bg-transparent"
              />
              <Input
                value={accent}
                placeholder="#3dff9a"
                onChange={(e) => setAccent(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>accent-2</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                aria-label="accent-2 color picker"
                value={accent2 && /^#[0-9a-fA-F]{6}$/.test(accent2) ? accent2 : "#56d6ff"}
                onChange={(e) => setAccent2(e.target.value)}
                className="h-10 w-12 cursor-pointer border border-line bg-transparent"
              />
              <Input
                value={accent2}
                placeholder="#56d6ff"
                onChange={(e) => setAccent2(e.target.value)}
              />
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setAccent("");
            setAccent2("");
          }}
        >
          clear accents (use preset)
        </Button>
      </section>

      <div className="terminal-window max-w-md space-y-2 p-4">
        <Label>default public language</Label>
        <Select
          value={defaultLocale}
          onChange={(e) => setDefaultLocale(e.target.value as Locale)}
        >
          <option value="zh">中文 (zh)</option>
          <option value="en">English (en)</option>
        </Select>
        <p className="text-xs text-ink-faint">
          visitors can still override language and enabled themes via header cookies.
        </p>
      </div>

      <div className="terminal-window p-4" style={previewStyle}>
        <p className="text-xs text-ink-faint">live preview</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="tag-chip">accent</span>
          <span className="btn-ghost !py-1 !text-xs">ghost</span>
          <span className="btn-primary !py-1 !text-xs">primary</span>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      <Button type="button" disabled={saving} onClick={() => void save()}>
        {saving ? "saving…" : "apply appearance"}
      </Button>
    </div>
  );
}
