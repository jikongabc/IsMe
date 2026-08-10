export const CONTENT_FORMATS = ["markdown", "html"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export function normalizeContentFormat(value: unknown): ContentFormat {
  return value === "html" ? "html" : "markdown";
}

/** Rough reading time in minutes (min 1 when content is non-empty). */
export function estimateReadingMinutes(content: string): number {
  const text = content
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~\-\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 0;
  const words = text.split(" ").filter(Boolean).length;
  // Mix CJK (~300 chars/min) and Latin (~200 wpm): use chars/400 as fallback density.
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const units = Math.max(words, Math.ceil(cjk / 2));
  return Math.max(1, Math.ceil(units / 200));
}
