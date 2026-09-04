/**
 * Build the composer-draft reference for a quoted file path and a 1-based
 * inclusive line range, e.g. `@"src/a.ts" L10-L20`. The path is always wrapped
 * in double quotes (matching the file-mention grammar's quoted form). This is a
 * machine-readable draft format, not product-facing copy, so its literals stay
 * inline rather than in the locale dictionary.
 * @param path - workspace file path to quote.
 * @param start - first selected line (1-based, inclusive).
 * @param end - last selected line (1-based, inclusive).
 * @returns the draft-reference string.
 */
export function composeReferenceDraft(path: string, start: number, end: number): string {
  return `@"${path}" L${start}-L${end}`
}
