/** Studio workspace content: WorkBase above FileTree, with no tab switching. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GitSummaryResult, WorkspaceId, WorkspaceView, WorkspaceSearchResult } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
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
  /** Search one Workspace's directory for a plain-text query. */
  searchWorkspace: (
    workspaceId: WorkspaceId,
    query: string,
    signal?: AbortSignal,
  ) => Promise<WorkspaceSearchResult>
}

/** Full composed props for the Studio workspace region. */
export type LeftPanelMainProps = PropsRuntime<'studio.workspace'>
  & PropsRenderSlots<'studio.workspace.directoryFlow'>
  & PropsLocale<typeof NS> & LeftPanelInjected & StudioWorkspaceOwnerProps
  & PropsStore<ReturnType<typeof createFileTreeStore>>

/** Percent the refresh bar reaches the moment a read starts, so it never reads as frozen at zero. */
const GIT_PROGRESS_START = 12
/** Percent the refresh bar creeps toward while the Host read is in flight; only a settled read reaches 100. */
const GIT_PROGRESS_CAP = 85
/** Percent added per creep step. */
const GIT_PROGRESS_STEP = 4
/** Milliseconds between creep steps while a read is in flight. */
const GIT_PROGRESS_STEP_MS = 120
/** Minimum milliseconds the progress animation stays visible so fast reads do not flash. */
const GIT_PROGRESS_MIN_MS = 320
/** Milliseconds the full bar holds after a read settles before it drops back to empty. */
const GIT_PROGRESS_DONE_MS = 200

/** Extract the displayable message from a rejected `gitSummary` read. */
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Fetch git summary for the current workspace, re-fetching on workspace change or manual refresh.
 * `progress` and `refreshing` describe the refresh request's own life cycle (creep toward
 * `GIT_PROGRESS_CAP` while the Host read is in flight, 100 once it settles); the Host reports no
 * partial repository-scan counts, so no value here measures scan completion.
 */
function useGitSummary(
  gitSummary: LeftPanelInjected['gitSummary'],
  workspaceId: WorkspaceId | undefined,
): {
  result: GitSummaryResult | null | undefined
  error: string | undefined
  refresh: () => void
  progress: number
  refreshing: boolean
} {
  const [result, setResult] = useState<GitSummaryResult | null | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const requestRef = useRef<AbortController | undefined>(undefined)
  const creepRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const holdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const minHoldRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const stopTimers = useCallback(() => {
    if (creepRef.current !== undefined) {
      clearInterval(creepRef.current)
      creepRef.current = undefined
    }
    if (minHoldRef.current !== undefined) {
      clearTimeout(minHoldRef.current)
      minHoldRef.current = undefined
    }
    if (holdRef.current !== undefined) {
      clearTimeout(holdRef.current)
      holdRef.current = undefined
    }
  }, [])

  const settle = useCallback(() => {
    stopTimers()
    setProgress(100)
    holdRef.current = setTimeout(() => {
      holdRef.current = undefined
      setRefreshing(false)
      setProgress(0)
    }, GIT_PROGRESS_DONE_MS)
  }, [stopTimers])

  const read = useCallback(() => {
    if (workspaceId === undefined) return
    requestRef.current?.abort()
    stopTimers()
    const controller = new AbortController()
    requestRef.current = controller
    setResult(undefined)
    setError(undefined)
    setRefreshing(true)
    setProgress(GIT_PROGRESS_START)
    const startedAt = performance.now()
    creepRef.current = setInterval(() => {
      setProgress(previous => Math.min(previous + GIT_PROGRESS_STEP, GIT_PROGRESS_CAP))
    }, GIT_PROGRESS_STEP_MS)
    const finish = (apply: () => void): void => {
      if (controller.signal.aborted) return
      apply()
      const elapsed = performance.now() - startedAt
      const remaining = Math.max(0, GIT_PROGRESS_MIN_MS - elapsed)
      if (remaining === 0) {
        settle()
        return
      }
      minHoldRef.current = setTimeout(() => {
        minHoldRef.current = undefined
        if (controller.signal.aborted) return
        settle()
      }, remaining)
    }
    try {
      void gitSummary(workspaceId, controller.signal).then(
        (value) => { finish(() => { setResult(value) }) },
        (reason: unknown) => {
          // Keep transport/provider failures distinct from a valid non-Git directory.
          finish(() => { setError(messageOf(reason)) })
        },
      )
    } catch (reason) {
      // A missing Client Remote fails before the carrier can create a request.
      finish(() => { setError(messageOf(reason)) })
    }
  }, [gitSummary, settle, stopTimers, workspaceId])

  useEffect(() => {
    read()
    return () => {
      requestRef.current?.abort()
      stopTimers()
    }
  }, [read, stopTimers])

  return { result, error, refresh: read, progress, refreshing }
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
  const {
    result: git, error: gitError, refresh: refreshGit, progress: gitProgress, refreshing: refreshingGit,
  } = useGitSummary(props.gitSummary, rootWorkspace?.workspaceId)
  const [adding, setAdding] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  const [addError, setAddError] = useState<string | undefined>(undefined)
  const addFlow: DirectoryFlowOwnerProps = {
    open: flowOpen,
    busy: adding,
    onPicked: (path) => {
      setAddError(undefined)
      setAdding(true)
      void props.createWorkspace({ path }).then(() => {
        setFlowOpen(false)
      }).catch(() => {
        setAddError(props.t('workspace.addFailed'))
      }).finally(() => { setAdding(false) })
    },
    onCancel: () => { setFlowOpen(false) },
    onError: (message) => {
      setFlowOpen(false)
      setAddError(message)
    },
  }
  return (
    <div className={css.main}>
      <section className={sections.workBase ? css.workBase : css.workBaseCollapsed} aria-labelledby="studio-workbase-title">
        <div className={css.sectionHeader}>
          <button
            type="button"
            id="studio-workbase-title"
            className={css.sectionTitle}
            aria-expanded={sections.workBase}
            onClick={() => { props.actions.toggleSection('workBase') }}
          >
            <WorkBaseIcon className={css.workspaceIcon} />
            <span>{props.t('workBase.title')}</span>
          </button>
          <button
            type="button"
            className={css.addWorkspace}
            aria-label={props.t('workspace.add')}
            title={props.t('workspace.add')}
            disabled={adding}
            onClick={() => { setAddError(undefined); setFlowOpen(true) }}
          >
            {adding ? <span className={css.addingSpinner} aria-hidden="true" /> : <span className={css.addIcon} aria-hidden="true" />}
          </button>
          {/* Decorative duplicate of the title toggle: the chevron marks the
              section's expansion state and stays clickable in place. */}
          <button
            type="button"
            className={css.sectionToggle}
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => { props.actions.toggleSection('workBase') }}
          >
            <ChevronIcon open={sections.workBase} className={css.sectionChevron} />
          </button>
        </div>
        <div className={css.sectionBody}><WorkBase {...props} addFlow={addFlow} addError={addError} /></div>
      </section>
      <section className={sections.fileTree ? css.fileTree : css.fileTreeCollapsed} aria-labelledby="studio-filetree-title">
        <div className={css.sectionHeader}>
          <button
            type="button"
            id="studio-filetree-title"
            className={css.sectionTitle}
            aria-expanded={sections.fileTree}
            onClick={() => { props.actions.toggleSection('fileTree') }}
          >
            <FileTreeIcon className={css.fileTreeIcon} />
            <span>{props.t('fileTree.title')}</span>
          </button>
          <button
            type="button"
            className={css.sectionToggle}
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => { props.actions.toggleSection('fileTree') }}
          >
            <ChevronIcon open={sections.fileTree} className={css.sectionChevron} />
          </button>
        </div>
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
          aria-busy={refreshingGit || undefined}
          title={gitError === undefined
            ? props.t('fileTree.gitRefresh')
            : props.t('fileTree.gitUnavailableDetail', { message: gitError })}
          onClick={refreshGit}
        >
          <span
            className={css.gitRefreshProgress}
            style={{ '--git-refresh-progress': `${gitProgress}%` } as CSSProperties}
            aria-hidden="true"
          />
          <span className={css.gitFooterContent}>
            <GitBranchIcon size={13} className={css.gitFooterIcon} />
            <span className={css.gitBranch}>
              {rootWorkspace === undefined
                ? props.t('fileTree.gitNoWorkspace')
                : gitError !== undefined
                  ? props.t('fileTree.gitUnavailable')
                  : git === undefined
                    ? ''
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
          </span>
        </button>
      </section>
    </div>
  )
}
