/** Studio workspace content: WorkBase above FileTree, with no tab switching. */
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { ChevronIcon, FileTreeIcon, WorkBaseIcon } from './icons/icons.tsx'
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
}

/** Full composed props for the Studio workspace region. */
export type LeftPanelMainProps = PropsRuntime<'studio.workspace'>
  & PropsRenderSlots<'studio.workspace.directoryFlow'>
  & PropsLocale<typeof NS> & LeftPanelInjected & StudioWorkspaceOwnerProps
  & PropsStore<ReturnType<typeof createFileTreeStore>>

/** Render WorkBase and FileTree concurrently, sharing the recent workspace root. */
export function LeftPanelMain(props: LeftPanelMainProps): React.ReactElement {
  const workspaces = props.useWorkspaces(s => s, (a, b) => a === b)
  const rootPath = workspaces.items[0]?.path
  const { expandedPaths, sections } = props.useStore(s => s)
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
      </section>
    </div>
  )
}
