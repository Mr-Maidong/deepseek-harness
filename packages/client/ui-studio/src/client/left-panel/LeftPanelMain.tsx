/** Studio workspace content: WorkBase above FileTree, with no tab switching. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GitSummaryResult, WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { ChevronIcon, FileTreeIcon, GitBranchIcon, WorkBaseIcon } from './icons/icons.tsx'
import { WorkBase } from './WorkBase.tsx'
import { FileTree } from './FileTree.tsx'
import { NS } from './locales.ts'
import type { createFileTreeStore } from './file-tree-store.ts'
import type { StudioWorkspaceOwnerProps } from '../frame/contract.ts'
import css from './LeftPanelMain.module.css'

/** Business operations supplied by the Studio client entry. */
export interface LeftPanelInjected {
  startSession: (workspaceId?: WorkspaceId) => void
  open: (sessionId: SessionId) => void
  archiveSession: (sessionId: SessionId) => Promise<void>
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<void>
  deleteWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  forkSession: (sessionId: SessionId) => void
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
  listDirectory: (path?: string, signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-api-remotes/client').DirectoryListing>
  readFile: (path: string) => Promise<{ path: string; content: string; language?: string }>
  /** Read git branch and uncommitted change counts for one Workspace. */
  gitSummary: (workspaceId: WorkspaceId, signal?: AbortSignal) => Promise<GitSummaryResult | null>
}

/** Full composed props for the Studio workspace region. */
export type LeftPanelMainProps = PropsRuntime<'studio.workspace'>
  & PropsRenderSlots<'studio.workspace.directoryFlow'>
  & PropsLocale<typeof NS> & LeftPanelInjected & StudioWorkspaceOwnerProps
  & PropsStore<ReturnType<typeof createFileTreeStore>>

/** Fetch git summary for the current workspace, re-fetching on workspace change or manual refresh. */
function useGitSummary(
  gitSummary: LeftPanelInjected['gitSummary'],
  workspaceId: WorkspaceId | undefined,
): { result: GitSummaryResult | null | undefined; error: string | undefined; refresh: () => void } {
  const [result, setResult] = useState<GitSummaryResult | null | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const requestRef = useRef<AbortController | undefined>(undefined)
  const read = useCallback(() => {
    if (workspaceId === undefined) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setResult(undefined)
    setError(undefined)
    try {
      void gitSummary(workspaceId, controller.signal).then((value) => {
        if (!controller.signal.aborted) setResult(value)
      }).catch((reason) => {
        // Keep transport/provider failures distinct from a valid non-Git directory.
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
      })
    } catch (reason) {
      // A missing Client Remote fails before the carrier can create a request.
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [gitSummary, workspaceId])
  useEffect(() => {
    read()
    return () => { requestRef.current?.abort() }
  }, [read])
  return { result, error, refresh: read }
}

/** Render WorkBase and FileTree concurrently for the current session's workspace. */
export function LeftPanelMain(props: LeftPanelMainProps): React.ReactElement {
  const workspaces = props.useWorkspaces(s => s, (a, b) => a === b)
  const currentSessionId = props.useSessions(s => s.current)
  const rootWorkspace = currentSessionId === undefined
    ? workspaces.items[0]
    : workspaces.items.find(workspace => workspace.sessionIds.includes(currentSessionId)) ?? workspaces.items[0]
  const rootPath = rootWorkspace?.path
  const { expandedPaths, sections } = props.useStore(s => s)
  const { result: git, error: gitError, refresh: refreshGit } = useGitSummary(props.gitSummary, rootWorkspace?.workspaceId)
  return (
    <div className={css.main}>
      <section className={sections.workBase ? css.workBase : css.workBaseCollapsed} aria-labelledby="studio-workbase-title">
        <button
          type="button"
          id="studio-workbase-title"
          className={css.sectionTitle}
          aria-expanded={sections.workBase}
          onClick={() => { props.actions.toggleSection('workBase') }}
        >
          <WorkBaseIcon className={css.workspaceIcon} />
          <span>{props.t('workBase.title')}</span>
          <ChevronIcon open={sections.workBase} className={css.sectionChevron} />
        </button>
        <div className={css.sectionBody}><WorkBase {...props} /></div>
      </section>
      <section className={sections.fileTree ? css.fileTree : css.fileTreeCollapsed} aria-labelledby="studio-filetree-title">
        <button
          type="button"
          id="studio-filetree-title"
          className={css.sectionTitle}
          aria-expanded={sections.fileTree}
          onClick={() => { props.actions.toggleSection('fileTree') }}
        >
          <FileTreeIcon className={css.fileTreeIcon} />
          <span>{props.t('fileTree.title')}</span>
          <ChevronIcon open={sections.fileTree} className={css.sectionChevron} />
        </button>
        <div className={css.sectionBody}>
          <FileTree
            {...props}
            rootPath={rootPath}
            onPreview={props.onPreview}
            expandedPaths={expandedPaths}
            onToggleExpanded={props.actions.toggleExpanded}
            openPath={props.openPath}
          />
        </div>
        <button
          type="button"
          className={css.gitFooter}
          aria-label={props.t('fileTree.gitRefresh')}
          title={gitError === undefined
            ? props.t('fileTree.gitRefresh')
            : props.t('fileTree.gitUnavailableDetail', { message: gitError })}
          onClick={refreshGit}
        >
          <GitBranchIcon size={13} className={css.gitFooterIcon} />
          <span className={css.gitBranch}>
            {rootWorkspace === undefined
              ? props.t('fileTree.gitNoWorkspace')
              : gitError !== undefined
                ? props.t('fileTree.gitUnavailable')
                : git === undefined
                  ? props.t('fileTree.loading')
                  : git === null
                    ? props.t('fileTree.gitUninitialized')
                    : (git.branch ?? props.t('fileTree.gitDetached'))}
          </span>
          {git !== null && git !== undefined && (git.insertions > 0 || git.deletions > 0 || git.untrackedFiles > 0) && (
            <span className={css.gitChanges}>
              {git.insertions > 0 && <span className={css.gitAdd}>+{git.insertions}</span>}
              {git.deletions > 0 && <span className={css.gitDel}>−{git.deletions}</span>}
              {git.untrackedFiles > 0 && <span className={css.gitUntracked}>{props.t('fileTree.gitUntracked', { n: git.untrackedFiles })}</span>}
            </span>
          )}
        </button>
      </section>
    </div>
  )
}
