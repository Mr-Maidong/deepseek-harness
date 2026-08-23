/** Studio workspace content: WorkBase above FileTree, with no tab switching. */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId, WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import { ChevronIcon, FileTreeIcon, WorkBaseIcon } from './icons/icons.tsx'
import { WorkBase } from './WorkBase.tsx'
import { FileTree } from './FileTree.tsx'
import { NS } from './locales.ts'
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
  pickDirectory: () => Promise<string | null>
  listDirectory: (path?: string, signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-client-runtime/client').DirectoryListing>
}

/** Props for the composed left rail seat. */
export type LeftPanelMainProps = PropsRuntime<'studio.workspace'> & PropsLocale<typeof NS> & LeftPanelInjected

/** Render WorkBase and FileTree concurrently, sharing the recent workspace root. */
export function LeftPanelMain(props: LeftPanelMainProps): React.ReactElement {
  const [expanded, setExpanded] = useState<'workBase' | 'fileTree'>('workBase')
  const workspaces = props.useWorkspaces(s => s, (a, b) => a === b)
  const rootPath = workspaces.recentWorkspaceId !== undefined
    ? workspaces.items.find(w => w.workspaceId === workspaces.recentWorkspaceId)?.path
    : workspaces.items[0]?.path
  return (
    <div className={css.main}>
      <section className={expanded === 'workBase' ? css.workBase : css.workBaseCollapsed} aria-labelledby="studio-workbase-title">
        <button
          type="button"
          id="studio-workbase-title"
          className={css.sectionTitle}
          aria-expanded={expanded === 'workBase'}
          onClick={() => { setExpanded('workBase') }}
        >
          <WorkBaseIcon />
          <span>{props.t('workBase.title')}</span>
          <ChevronIcon open={expanded === 'workBase'} className={css.sectionChevron} />
        </button>
        {expanded === 'workBase' && <div className={css.sectionBody}><WorkBase {...props} /></div>}
      </section>
      <section className={expanded === 'fileTree' ? css.fileTree : css.fileTreeCollapsed} aria-labelledby="studio-filetree-title">
        <button
          type="button"
          id="studio-filetree-title"
          className={css.sectionTitle}
          aria-expanded={expanded === 'fileTree'}
          onClick={() => { setExpanded('fileTree') }}
        >
          <FileTreeIcon />
          <span>{props.t('fileTree.title')}</span>
          <ChevronIcon open={expanded === 'fileTree'} className={css.sectionChevron} />
        </button>
        {expanded === 'fileTree' && <div className={css.sectionBody}><FileTree {...props} rootPath={rootPath} /></div>}
      </section>
    </div>
  )
}
