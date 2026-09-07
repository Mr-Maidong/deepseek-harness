/**
 * Git-summary Service Definition: the `ctx.gitSummary` capability contract.
 * @module @deepseek-ai/dsh-host-git-summary/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { GitSummaryResult } from './types.ts'

export type { GitSummaryResult }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host git-summary capability. */
    gitSummary: GitSummaryRuntime
  }
}

/**
 * Abstract git-summary service. Subclass, implement {@link summary}, and load
 * the subclass as a plugin — it registers as `ctx.gitSummary` (one
 * implementation per context; loading a second throws per cordis duplicate-
 * service behavior).
 */
export abstract class GitSummaryRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'gitSummary')
  }

  /**
   * Read the git state of one directory.
   * @param path - absolute directory to inspect.
   * @param signal - caller lifetime; abort cancels pending git work.
   * @returns the branch and change counts, or null when the directory is not
   *   inside a git repository.
   */
  abstract summary(
    path: string,
    signal?: AbortSignal,
  ): Promise<GitSummaryResult | null>
}
