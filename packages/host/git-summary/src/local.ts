/**
 * Local git-summary provider: spawns the host's `git` CLI through
 * `ctx.subprocess` to read branch name and uncommitted change counts.
 * @module @deepseek-ai/dsh-host-git-summary/local
 */

import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { GitSummaryRuntime } from './service.ts'
import type { GitSummaryResult } from './types.ts'

/** Maximum bytes to collect from one git stdout (branch names and numstat are small). */
const GIT_STDOUT_MAX_BYTES = 256 * 1024

/** Maximum bytes to retain from git stderr for diagnostics. */
const GIT_STDERR_MAX_BYTES = 8 * 1024

/** Terminate grace period for git processes (ms). */
const GIT_GRACE_MS = 3_000

/**
 * Local git-summary implementation. Loaded as a plugin it registers as
 * `ctx.gitSummary` and reads repository state from the host `git` CLI.
 */
export class LocalGitSummary extends GitSummaryRuntime {
  static inject = ['subprocess']

  async summary(path: string, signal?: AbortSignal): Promise<GitSummaryResult | null> {
    // Verify the directory is inside a git repository by resolving the toplevel.
    const topLevel = await this.runGit(
      ['rev-parse', '--show-toplevel'],
      path,
      signal,
    )
    if (topLevel === null) return null

    // Read the current branch (symbolic-ref fails on detached HEAD).
    const branch = await this.runGit(
      ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      path,
      signal,
    )
    const detached = branch === null

    // Count insertions/deletions against HEAD. For an unborn branch (no
    // commits), diff against the empty tree hash.
    const headExists = await this.runGit(
      ['rev-parse', '--verify', 'HEAD'],
      path,
      signal,
    )
    const diffTarget = headExists !== null ? 'HEAD' : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    const numstat = await this.runGit(
      ['diff', '--numstat', '-z', diffTarget],
      path,
      signal,
    )
    const { insertions, deletions } = parseNumstat(numstat ?? '')

    // Count untracked files.
    const untracked = await this.runGit(
      ['ls-files', '--others', '--exclude-standard', '-z'],
      path,
      signal,
    )
    const untrackedFiles = countNullDelimited(untracked ?? '')

    return {
      branch,
      detached,
      insertions,
      deletions,
      untrackedFiles,
    }
  }

  /**
   * Run one git command and return its trimmed stdout, or null when git
   * reports an error (non-zero exit, typically "not a repository" or
   * "ambiguous argument"). Spawn-level failures propagate as thrown errors.
   */
  private async runGit(
    argv: readonly string[],
    cwd: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const handle = this.ctx.subprocess.spawn({
      argv: ['git', ...argv],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: GIT_STDOUT_MAX_BYTES },
        stderr: { maxBytes: GIT_STDERR_MAX_BYTES },
      },
      graceMs: GIT_GRACE_MS,
      signal,
    } satisfies SubprocessSpawnSpec)

    const outcome = await handle.done
    // A signal-killed child reports `exitCode: null`, so this one test covers
    // both abnormal exits and terminations.
    if (outcome.exitCode !== 0) return null

    // Present because every spawn here requests collect mode for stdout.
    /* v8 ignore start -- the provider supplies a reader for every collect-mode stream */
    const stdout = handle.collected.stdout?.readFrom(0)
    if (stdout === undefined) return null
    /* v8 ignore stop */
    return stdout.text.trim() || null
  }
}

/**
 * Parse git diff --numstat -z output into insertion/deletion totals. Binary
 * files show as `- -` and are skipped. The -z format uses NUL delimiters
 * between fields and entries; lines look like `<added>\t<deleted>\t<path>\0`.
 * @param raw - NUL-delimited numstat text.
 * @returns summed insertions and deletions across parseable entries.
 */
export function parseNumstat(raw: string): { insertions: number; deletions: number } {
  let insertions = 0
  let deletions = 0
  // Split on NUL; each entry is `added\tdeleted\tpath` (the trailing NUL
  // produces an empty final segment which we skip).
  for (const entry of raw.split('\0')) {
    if (entry === '') continue
    const tab = entry.indexOf('\t')
    if (tab < 0) continue
    const added = entry.slice(0, tab)
    const rest = entry.slice(tab + 1)
    const tab2 = rest.indexOf('\t')
    if (tab2 < 0) continue
    const deleted = rest.slice(0, tab2)
    // Binary files report `-` for both columns.
    if (added === '-' || deleted === '-') continue
    const a = Number(added)
    const d = Number(deleted)
    if (!Number.isFinite(a) || !Number.isFinite(d)) continue
    insertions += a
    deletions += d
  }
  return { insertions, deletions }
}

/**
 * Count non-empty segments in a NUL-delimited list.
 * @param raw - NUL-delimited path list from `git ls-files -z`.
 * @returns number of listed paths.
 */
export function countNullDelimited(raw: string): number {
  if (raw === '') return 0
  let count = 0
  for (const segment of raw.split('\0')) {
    if (segment !== '') count++
  }
  return count
}
