/**
 * Local workspace-search provider: spawns the packaged ripgrep binary
 * (`@vscode/ripgrep`) through `ctx.subprocess` to run a plain-text search over
 * a workspace directory, honoring `.gitignore` and the provider's configured
 * limits. The binary ships as an npm dependency, so no host `rg` install is
 * required.
 * @module @deepseek-ai/dsh-host-workspace-search/local
 */

import { join } from 'node:path'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { WorkspaceSearchRuntime } from './service.ts'
import type {
  WorkspaceSearchFile,
  WorkspaceSearchMatch,
  WorkspaceSearchResult,
} from './types.ts'

/** Maximum bytes of query text accepted; longer queries are rejected. */
export const SEARCH_QUERY_MAX_BYTES = 1024
/** Maximum number of files reported in one result. */
export const SEARCH_MAX_FILES = 500
/** Maximum number of matches reported in one result. */
export const SEARCH_MAX_MATCHES = 5_000
/** Maximum bytes of ripgrep JSON output collected before the result is truncated. */
export const SEARCH_MAX_OUTPUT_BYTES = 2 * 1024 * 1024
/** Maximum UTF-16 code units of one preview line retained after trimming. */
export const SEARCH_MAX_PREVIEW_UNITS = 512
/** Maximum bytes of one file ripgrep is willing to search. */
export const SEARCH_MAX_FILE_BYTES = 5 * 1024 * 1024
/** Terminate grace period for ripgrep processes (ms). */
export const SEARCH_GRACE_MS = 3_000
/** Maximum bytes retained from ripgrep stderr for diagnostics. */
export const SEARCH_STDERR_MAX_BYTES = 8 * 1024

/** Directories always excluded from search regardless of `.gitignore`. */
const ALWAYS_EXCLUDED = [
  '!.git/**',
  '!node_modules/**',
  '!dist/**',
  '!lib/**',
  '!build/**',
  '!coverage/**',
]

/** The packaged ripgrep binary path, resolved lazily once per process. */
let rgPathPromise: Promise<string> | undefined

/**
 * The packaged ripgrep binary's absolute path. `@vscode/ripgrep` selects the
 * platform package (`@vscode/ripgrep-<platform>-<arch>`) and exports its
 * binary path as `rgPath`; resolving at the call boundary keeps a missing or
 * corrupt binary at the first search call rather than failing Loader
 * composition.
 * @returns the packaged binary's absolute path; the memoized promise rejects
 *   when the platform package cannot be resolved.
 */
export function resolveRgPath(): Promise<string> {
  rgPathPromise ??= Promise.resolve().then(async () => (await import('@vscode/ripgrep')).rgPath)
  return rgPathPromise
}

/**
 * Local workspace-search implementation. Loaded as a plugin it registers as
 * `ctx.workspaceSearch` and runs the packaged ripgrep binary over the
 * requested directory.
 */
export class LocalWorkspaceSearch extends WorkspaceSearchRuntime {
  static inject = ['subprocess']

  async search(
    path: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceSearchResult> {
    if (Buffer.byteLength(query, 'utf8') > SEARCH_QUERY_MAX_BYTES) {
      throw new Error(`search query exceeds ${SEARCH_QUERY_MAX_BYTES} bytes`)
    }
    const startedAt = performance.now()
    const handle = this.ctx.subprocess.spawn({
      argv: [
        await resolveRgPath(),
        '--json',
        '--fixed-strings',
        '--color', 'never',
        '--hidden',
        '--no-messages',
        // Honor .gitignore even when the directory is not inside a git
        // repository; without this flag ripgrep only applies ignore rules
        // inside a repo.
        '--no-require-git',
        '--max-filesize', `${SEARCH_MAX_FILE_BYTES}`,
        ...ALWAYS_EXCLUDED.map(glob => ['--glob', glob]).flat(),
        '--',
        query,
        '.',
      ],
      cwd: path,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: SEARCH_MAX_OUTPUT_BYTES },
        stderr: { maxBytes: SEARCH_STDERR_MAX_BYTES },
      },
      graceMs: SEARCH_GRACE_MS,
      signal,
    } satisfies SubprocessSpawnSpec)

    const outcome = await handle.done
    // Exit 0 = matches found, 1 = no matches (a valid empty result), 2 = error.
    // A signal-killed child reports `exitCode: null`; treat it as a normal
    // cancellation by returning whatever was collected before termination.
    if (outcome.exitCode === 2) {
      throw new Error('ripgrep failed to search the workspace')
    }

    // Present because every spawn here requests collect mode for stdout.
    /* v8 ignore start -- the provider supplies a reader for every collect-mode stream */
    const stdout = handle.collected.stdout?.readFrom(0)
    if (stdout === undefined) throw new Error('ripgrep produced no readable output')
    /* v8 ignore stop */

    const { files, fileCount, matchCount, truncated } = parseRipgrepJson(
      stdout.text,
      SEARCH_MAX_FILES,
      SEARCH_MAX_MATCHES,
      SEARCH_MAX_PREVIEW_UNITS,
    )
    return {
      // Consumers read these files through the directory-picker read fence,
      // which takes fully qualified paths only; join each ripgrep-relative
      // path onto the searched directory with the platform's own separator
      // style, so a result names a file exactly as a Host directory listing
      // would.
      files: files.map(file => ({ ...file, path: join(path, file.path) })),
      fileCount,
      matchCount,
      truncated: truncated || stdout.lossy,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }
}

/**
 * Parse ripgrep `--json` output into the bounded result vocabulary.
 * @param raw - the complete JSON-lines stream from ripgrep.
 * @param maxFiles - cap on reported files.
 * @param maxMatches - cap on reported matches.
 * @param maxPreviewUnits - cap on one preview line's retained code units.
 * @returns the bounded result plus whether a limit stopped the search early.
 */
export function parseRipgrepJson(
  raw: string,
  maxFiles: number,
  maxMatches: number,
  maxPreviewUnits: number,
): {
  files: WorkspaceSearchFile[]
  fileCount: number
  matchCount: number
  truncated: boolean
} {
  const files: WorkspaceSearchFile[] = []
  let fileCount = 0
  let matchCount = 0
  let truncated = false
  // Group matches by path as ripgrep emits them (begin/match/end per file).
  let current: { path: string; matches: WorkspaceSearchMatch[] } | undefined
  for (const line of raw.split('\n')) {
    if (line === '') continue
    let event: unknown
    try {
      event = JSON.parse(line)
    } catch {
      // A malformed line is not a search result; skip it rather than fail the
      // whole read (ripgrep output is trusted but defensive here).
      continue
    }
    if (!isRecord(event)) continue
    const type = event.type
    if (type === 'begin') {
      const path = pathOf(event.data)
      if (path === undefined) continue
      current = { path, matches: [] }
      continue
    }
    if (type === 'end') {
      if (current !== undefined) {
        if (current.matches.length > 0) {
          files.push({ path: current.path, matches: current.matches })
          fileCount++
        }
        current = undefined
      }
      continue
    }
    if (type === 'match') {
      if (current === undefined) continue
      const match = matchOf(event.data, maxPreviewUnits)
      if (match === undefined) continue
      if (matchCount >= maxMatches) {
        truncated = true
        continue
      }
      current.matches.push(match)
      matchCount++
      continue
    }
    // summary and any future event types are ignored.
  }
  // A result that hit the file cap is truncated even if the last file was
  // still being collected when the cap was reached.
  if (fileCount > maxFiles) {
    truncated = true
    files.length = maxFiles
    fileCount = maxFiles
  }
  return { files, fileCount, matchCount, truncated }
}

/** Extract the search-directory-relative path from a ripgrep path object (`./a.ts` → `a.ts`). */
function pathOf(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined
  const path = data.path
  if (!isRecord(path)) return undefined
  const text = path.text
  if (typeof text !== 'string') return undefined
  return text.startsWith('./') ? text.slice(2) : text
}

/**
 * Convert one ripgrep match event into a {@link WorkspaceSearchMatch}, or
 * undefined when the event is malformed. Byte offsets from ripgrep are
 * converted to UTF-16 code units so the browser can slice the preview with
 * native string indexing.
 */
function matchOf(data: unknown, maxPreviewUnits: number): WorkspaceSearchMatch | undefined {
  if (!isRecord(data)) return undefined
  const lines = data.lines
  if (!isRecord(lines)) return undefined
  const lineText = lines.text
  if (typeof lineText !== 'string') return undefined
  const lineNumber = data.line_number
  if (typeof lineNumber !== 'number') return undefined
  const submatches = data.submatches
  if (!Array.isArray(submatches)) return undefined
  const first: unknown = submatches[0]
  if (!isRecord(first)) return undefined
  const start = first.start
  const end = first.end
  if (typeof start !== 'number' || typeof end !== 'number') return undefined

  // Convert ripgrep's byte offsets into UTF-16 code-unit offsets in the full
  // line, then trim the preview around the match in code units so the match
  // stays intact and the offsets stay valid for the trimmed preview.
  const matchStartFull = utf16Offset(lineText, start)
  const matchEndFull = utf16Offset(lineText, end)
  const { text: preview, startOffset } = trimPreview(
    lineText,
    matchStartFull,
    matchEndFull,
    maxPreviewUnits,
  )
  const matchStart = matchStartFull - startOffset
  const matchLength = matchEndFull - matchStartFull
  return {
    line: lineNumber,
    column: matchStart + 1,
    preview,
    matchStart,
    matchLength,
  }
}

/**
 * Trim a matching line to a bounded window around the match, in UTF-16 code
 * units. The window keeps `maxPreviewUnits` code units centered on the match,
 * clamped to the line bounds.
 * @param line - the full matching line (with trailing newline).
 * @param matchStart - code-unit offset of the match start.
 * @param matchEnd - code-unit offset of the match end.
 * @param maxPreviewUnits - maximum retained code units.
 * @returns the trimmed preview and its code-unit offset within the line.
 */
export function trimPreview(
  line: string,
  matchStart: number,
  matchEnd: number,
  maxPreviewUnits: number,
): { text: string; startOffset: number } {
  if (line.length <= maxPreviewUnits) return { text: line, startOffset: 0 }
  const matchLength = matchEnd - matchStart
  const margin = Math.max(0, Math.floor((maxPreviewUnits - matchLength) / 2))
  const from = Math.max(0, matchStart - margin)
  const to = Math.min(line.length, matchEnd + margin)
  return { text: line.slice(from, to), startOffset: from }
}

/**
 * Convert a byte offset into a UTF-16 code-unit offset within `text`. The
 * offset is clamped to the text length; a byte offset that lands inside a
 * multibyte character resolves to the code unit at the character boundary.
 * @param text - the line text the byte offset indexes into.
 * @param byteOffset - the ripgrep byte offset to convert.
 * @returns the offset in UTF-16 code units.
 */
export function utf16Offset(text: string, byteOffset: number): number {
  const bytes = Buffer.from(text, 'utf8')
  const clamped = Math.max(0, Math.min(byteOffset, bytes.length))
  // Walk the UTF-8 bytes to find the code-unit position of the byte offset.
  // A 4-byte sequence is a surrogate pair (2 code units); shorter sequences
  // are single code units.
  let codeUnits = 0
  let byteIndex = 0
  while (byteIndex < clamped) {
    const byte = bytes[byteIndex]
    /* v8 ignore next 2 -- the clamp bounds the walk to the buffer, so the reader never runs past the last byte */
    if (byte === undefined) break
    if (byte < 0x80) {
      byteIndex += 1
      codeUnits += 1
    } else if (byte < 0xe0) {
      byteIndex += 2
      codeUnits += 1
    } else if (byte < 0xf0) {
      byteIndex += 3
      codeUnits += 1
    } else {
      byteIndex += 4
      codeUnits += 2
    }
  }
  return codeUnits
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
