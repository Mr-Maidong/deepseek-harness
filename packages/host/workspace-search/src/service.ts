/**
 * Workspace-search Service Definition: the `ctx.workspaceSearch` capability
 * contract.
 * @module @deepseek-ai/dsh-host-workspace-search/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { WorkspaceSearchResult } from './types.ts'

export type { WorkspaceSearchResult }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host workspace-search capability. */
    workspaceSearch: WorkspaceSearchRuntime
  }
}

/**
 * Abstract workspace-search service. Subclass, implement {@link search}, and
 * load the subclass as a plugin — it registers as `ctx.workspaceSearch` (one
 * implementation per context; loading a second throws per cordis duplicate-
 * service behavior).
 */
export abstract class WorkspaceSearchRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'workspaceSearch')
  }

  /**
   * Search one directory for a plain-text query, honoring `.gitignore` and
   * the provider's configured limits.
   * @param path - absolute directory to search.
   * @param query - plain-text query; never interpreted as a regular expression.
   * @param signal - caller lifetime; abort cancels pending search work.
   * @returns the bounded one-shot result; each result file's `path` is a fully qualified
   *   host path joined onto `path`, ready for the directory-picker read.
   */
  abstract search(
    path: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceSearchResult>
}
