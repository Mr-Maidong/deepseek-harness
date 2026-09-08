/**
 * Result vocabulary for the workspace-search capability. Types only — no
 * runtime code, so a Client compilation face reads exactly the shapes the
 * Host emits.
 * @module @deepseek-ai/dsh-host-workspace-search/types
 */

/**
 * One plain-text match inside a single line of a workspace file. Line and
 * column are 1-based; `matchStart`/`matchLength` are UTF-16 code-unit offsets
 * into the line text, so a browser can slice the preview with native string
 * indexing regardless of multibyte content.
 */
export interface WorkspaceSearchMatch {
  /** 1-based line number of the matching line. */
  readonly line: number
  /** 1-based column of the first matched character. */
  readonly column: number
  /** The full matching line, trimmed to a bounded preview. */
  readonly preview: string
  /** UTF-16 code-unit offset of the match within `preview`. */
  readonly matchStart: number
  /** UTF-16 code-unit length of the match within `preview`. */
  readonly matchLength: number
}

/** One workspace file that contains at least one match. */
export interface WorkspaceSearchFile {
  /** Fully qualified host path of the file, in the same separator style a Host directory listing reports (e.g. `/work/demo/src/a.ts`). */
  readonly path: string
  /** Matches in this file, in line order. */
  readonly matches: readonly WorkspaceSearchMatch[]
}

/**
 * One-shot result of a workspace search. The Host applies the configured
 * limits and reports whether any were hit, so the browser can show a
 * truncation notice instead of silently missing results.
 */
export interface WorkspaceSearchResult {
  /** Files containing at least one match, in ripgrep's traversal order. */
  readonly files: readonly WorkspaceSearchFile[]
  /** Total number of files with at least one match. */
  readonly fileCount: number
  /** Total number of matches across all files. */
  readonly matchCount: number
  /** True when a file, match, or output-byte limit stopped the search early. */
  readonly truncated: boolean
  /** Wall-clock duration of the Host search in milliseconds. */
  readonly durationMs: number
}
