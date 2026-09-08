/**
 * Host capability for plain-text code search over a workspace directory:
 * one-shot, `.gitignore`-aware, bounded results with line/column positioning.
 *
 * The service exposes one method, {@link WorkspaceSearchRuntime.search}, which
 * returns a bounded one-shot result. The local implementation spawns `rg`
 * through `ctx.subprocess`; other providers may substitute a different
 * execution world.
 *
 * @module @deepseek-ai/dsh-host-workspace-search
 */

export { WorkspaceSearchRuntime } from './service.ts'
export type {
  WorkspaceSearchFile,
  WorkspaceSearchMatch,
  WorkspaceSearchResult,
} from './types.ts'

// The default export is the local provider — the Loader instantiates it as a
// plugin and registers ctx.workspaceSearch. Named exports carry the abstract
// service and result types for consumers that inject or type against the seam.
export { LocalWorkspaceSearch } from './local.ts'
export { LocalWorkspaceSearch as default } from './local.ts'
