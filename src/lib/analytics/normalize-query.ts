/** Normalize visitor questions for hot-ranking aggregation. */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?？!！.。,，;；:：]+$/g, "");
}
