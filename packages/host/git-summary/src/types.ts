/**
 * Result vocabulary for the git-summary capability. Types only — no runtime
 * code, so a Client compilation face reads exactly the shapes the Host emits.
 * @module @deepseek-ai/dsh-host-git-summary/types
 */

/**
 * Git state of one workspace directory: current branch and uncommitted
 * insertion/deletion counts against HEAD. Null from the service means the
 * directory is not inside a git repository.
 */
export interface GitSummaryResult {
  /** Current branch name, or null when HEAD is detached. */
  readonly branch: string | null
  /** True when HEAD is detached (no symbolic ref). */
  readonly detached: boolean
  /** Total inserted lines across tracked-file changes vs HEAD (staged + unstaged). */
  readonly insertions: number
  /** Total deleted lines across tracked-file changes vs HEAD (staged + unstaged). */
  readonly deletions: number
  /** Number of untracked files (not counted in insertions/deletions). */
  readonly untrackedFiles: number
}
