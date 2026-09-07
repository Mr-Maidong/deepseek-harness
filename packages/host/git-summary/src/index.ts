/**
 * Host capability for reading git state of a workspace directory: current
 * branch name and uncommitted insertion/deletion counts against HEAD.
 *
 * The service exposes one method, {@link GitSummaryRuntime.summary}, which
 * returns null when the directory is not inside a git repository. The local
 * implementation spawns `git` through `ctx.subprocess`; other providers may
 * substitute a different execution world.
 *
 * @module @deepseek-ai/dsh-host-git-summary
 */

export { GitSummaryRuntime } from './service.ts'
export type { GitSummaryResult } from './types.ts'

// The default export is the local provider — the Loader instantiates it as a
// plugin and registers ctx.gitSummary. Named exports carry the abstract
// service and result types for consumers that inject or type against the seam.
export { LocalGitSummary } from './local.ts'
export { LocalGitSummary as default } from './local.ts'
