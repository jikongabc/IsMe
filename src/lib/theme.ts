export const SITE_THEMES = ["terminal", "ocean", "day", "ember", "slate"] as const;

export type SiteTheme = (typeof SITE_THEMES)[number];

/** Cookie for visitor theme override (same pattern as locale). */
export const THEME_COOKIE = "isme_theme";

export const THEME_META: Record<
  SiteTheme,
  { label: string; blurb: string; short: string }
> = {
  terminal: {
    label: "terminal",
    short: "term",
    blurb: "phosphor green on near-black — default geek shell",
  },
  ocean: {
    label: "ocean",
    short: "ocean",
    blurb: "deep navy with cyan accents — still dark, cooler tone",
  },
  day: {
    label: "day",
    short: "day",
    blurb: "cool light surface with teal accents — readable outdoors",
  },
  ember: {
    label: "ember",
    short: "ember",
    blurb: "charcoal base with amber highlights — warm, still dark",
  },
  slate: {
    label: "slate",
    short: "slate",
    blurb: "neutral graphite with steel blue accents — low chroma",
  },
};

export function normalizeTheme(value: unknown): SiteTheme {
  if (typeof value === "string" && (SITE_THEMES as readonly string[]).includes(value)) {
    return value as SiteTheme;
  }
  return "terminal";
}

export function isSiteTheme(value: unknown): value is SiteTheme {
  return typeof value === "string" && (SITE_THEMES as readonly string[]).includes(value);
}

export type ThemeConfig = {
  /** Themes visitors may pick in the header switcher. */
  enabledThemes: SiteTheme[];
  /** Optional accent override (#RRGGBB). Empty = preset default. */
  accent: string;
  /** Optional secondary accent. Empty = derive from accent or preset. */
  accent2: string;
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  enabledThemes: [...SITE_THEMES],
  accent: "",
  accent2: "",
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function normalizeHexColor(value: string): string {
  const raw = value.trim();
  if (!isHexColor(raw)) return "";
  if (raw.length === 4) {
    const r = raw[1]!;
    const g = raw[2]!;
    const b = raw[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return raw.toLowerCase();
}

export function parseThemeConfig(raw: unknown): ThemeConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_THEME_CONFIG, enabledThemes: [...SITE_THEMES] };

  const obj = raw as Record<string, unknown>;
  const enabled = Array.isArray(obj.enabledThemes)
    ? obj.enabledThemes.filter(isSiteTheme)
    : [...SITE_THEMES];

  return {
    enabledThemes: enabled.length > 0 ? uniqueThemes(enabled) : [...SITE_THEMES],
    accent: typeof obj.accent === "string" ? normalizeHexColor(obj.accent) : "",
    accent2: typeof obj.accent2 === "string" ? normalizeHexColor(obj.accent2) : "",
  };
}

function uniqueThemes(list: SiteTheme[]): SiteTheme[] {
  return SITE_THEMES.filter((id) => list.includes(id));
}

/** Ensure default theme is always among enabled themes. */
export function coerceThemeConfig(
  config: ThemeConfig,
  defaultTheme: SiteTheme,
): ThemeConfig {
  const enabled = config.enabledThemes.includes(defaultTheme)
    ? config.enabledThemes
    : uniqueThemes([defaultTheme, ...config.enabledThemes]);
  return {
    enabledThemes: enabled.length > 0 ? enabled : [defaultTheme],
    accent: config.accent,
    accent2: config.accent2,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** CSS custom properties for optional accent overrides. */
export function themeOverrideStyle(
  config: ThemeConfig,
): Record<string, string> | undefined {
  const accent = config.accent;
  if (!accent) return undefined;

  const accent2 = config.accent2 || accent;
  const onAccent = relativeLuminance(accent) > 0.55 ? "#04110a" : "#f7fafc";

  return {
    "--accent": accent,
    "--accent-2": accent2,
    "--accent-soft": hexToRgba(accent, 0.12),
    "--atmosphere-a": hexToRgba(accent, 0.14),
    "--atmosphere-b": hexToRgba(accent2, 0.1),
    "--btn-on-accent": onAccent,
    "--line": hexToRgba(accent2, 0.22),
  };
}
