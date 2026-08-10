/** Document types accepted for CogDoc ingest via admin upload. */
export const ALLOWED_DOC_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".csv",
  ".json",
  ".docx",
] as const;

export const ALLOWED_DOC_ACCEPT =
  ".pdf,.txt,.md,.markdown,.html,.htm,.csv,.json,.docx,application/pdf,text/plain,text/markdown,text/html,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAX_DOC_BYTES = 40 * 1024 * 1024;

export function docExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx >= 0 ? lower.slice(idx) : "";
}

export function isAllowedDocFilename(filename: string): boolean {
  const ext = docExtension(filename);
  return (ALLOWED_DOC_EXTENSIONS as readonly string[]).includes(ext);
}

export function assertAllowedDoc(file: { name: string; size: number }): string | null {
  if (!isAllowedDocFilename(file.name || "upload.bin")) {
    return `Unsupported type — allow: ${ALLOWED_DOC_EXTENSIONS.join(", ")}`;
  }
  if (file.size > MAX_DOC_BYTES) {
    return "File too large (max 40MB)";
  }
  return null;
}
