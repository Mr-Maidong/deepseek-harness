/** Studio workspace content: WorkBase above FileTree, with no tab switching. */
import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GitSummaryResult, WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { ChevronIcon, FileTreeIcon, GitBranchIcon, RefreshIcon, WorkBaseIcon } from './icons/icons.tsx'
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
): { result: GitSummaryResult | null | undefined; refresh: () => void } {
  const [result, setResult] = useState<GitSummaryResult | null | undefined>(undefined)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (workspaceId === undefined) { setResult(undefined); return }
    const controller = new AbortController()
    setResult(undefined)
    void gitSummary(workspaceId, controller.signal).then(setResult).catch(() => {
      if (!controller.signal.aborted) setResult(null)
    })
    return () => { controller.abort() }
  }, [gitSummary, workspaceId, tick])
  const refresh = useCallback(() => { setTick(t => t + 1) }, [])
  return { result, refresh }
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
  const { result: git, refresh: refreshGit } = useGitSummary(props.gitSummary, rootWorkspace?.workspaceId)
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
        {git !== undefined && git !== null && (
          <button
            type="button"
            className={css.gitFooter}
            aria-label={props.t('fileTree.gitRefresh')}
            title={props.t('fileTree.gitRefresh')}
            onClick={refreshGit}
          >
            <GitBranchIcon size={13} className={css.gitFooterIcon} />
            <span className={css.gitBranch}>{git.branch ?? props.t('fileTree.gitDetached')}</span>
            {(git.insertions > 0 || git.deletions > 0) && (
              <span className={css.gitChanges}>
                {git.insertions > 0 && <span className={css.gitAdd}>+{git.insertions}</span>}
                {git.deletions > 0 && <span className={css.gitDel}>−{git.deletions}</span>}
              </span>
            )}
            <RefreshIcon size={12} className={css.gitRefresh} />
          </button>
        )}
      </section>
    </div>
  )
}
