/**
 * WorkBase: the studio's own WorkBase view — a card list of the
 * registered Host workspaces with the sessions under each, plus New Session
 * and Add workspace (path prompt). Deliberately lighter than ui-workspace's
 * WorkspaceBrowser: no grouping modes, drag reorder, or inline search — the
 * rail's job here is navigation, not management.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChevronIcon, SessionIcon } from './icons/icons.tsx'
import { NS } from './locales.ts'
import type { LeftPanelInjected } from './LeftPanelMain.tsx'
import css from './WorkBase.module.css'

/** Full composed props for the workspace view. */
export type WorkBaseProps = PropsRuntime<'studio.workspace'> & PropsRenderSlots<'studio.workspace.directoryFlow'> & PropsLocale<typeof NS> & LeftPanelInjected

/** The dependency slice cards and rows read (locale + injected verbs). */
type WorkBaseDeps = Pick<WorkBaseProps, keyof LeftPanelInjected | 't' | 'useSessions' | 'useWorkspaces'>

/** One workspace card with an expandable session list. */
function WorkspaceCard({
  workspace, sessions, current, archivingSessionIds, onArchive, expanded, onToggle, onNewSession, onRename, onDelete, deps,
}: {
  workspace: WorkspaceView
  sessions: readonly { id: SessionId; title: string }[]
  current: SessionId | undefined
  archivingSessionIds: ReadonlySet<SessionId>
  onArchive: (sessionId: SessionId) => void
  expanded: boolean
  onToggle: () => void
  onNewSession: () => void
  onRename: () => void
  onDelete: () => void
  deps: WorkBaseDeps
}): React.ReactElement {
  const { t } = deps
  const hasCurrentSession = sessions.some(session => session.id === current)
  return (
    <div className={css.workspaceGroup} data-current={hasCurrentSession || undefined}>
      <div className={css.workspaceHeader}>
        <button type="button" className={css.workspaceToggle} onClick={onToggle} aria-expanded={expanded}>
          <ChevronIcon open={expanded} className={css.chevron} />
          <span className={css.workspaceTitle}>{workspace.title}</span>
        </button>
        <div className={css.workspaceActions}>
          <button type="button" className={css.iconButton} aria-label={t('workspace.newSession')} title={t('workspace.newSession')} onClick={onNewSession}>
            <span className={css.newIcon} aria-hidden="true" />
          </button>
          <button type="button" className={css.iconButton} aria-label={t('workspace.rename')} title={t('workspace.rename')} onClick={onRename}>
            <span className={css.editIcon} aria-hidden="true" />
          </button>
          <button type="button" className={`${css.iconButton} ${css.deleteAction}`} aria-label={t('workspace.delete')} onClick={onDelete}>
            <span className={css.deleteIcon} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={css.sessionList} data-expanded={expanded || undefined}>
        <div className={css.sessionListContent}>
          {sessions.length === 0 && <div className={css.emptyHint}>{t('session.empty')}</div>}
          {sessions.map(session => (
            <SessionRow
              key={session.id}
              sessionId={session.id}
              title={session.title}
              current={current === session.id}
              archiving={archivingSessionIds.has(session.id)}
              onArchive={() => { onArchive(session.id) }}
              deps={deps}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** One session row: click to open; hover reveals rename and archive actions. */
function SessionRow({ sessionId, title, current, archiving, onArchive, deps }: {
  sessionId: SessionId
  title: string
  current: boolean
  archiving: boolean
  onArchive: () => void
  deps: WorkBaseDeps
}): React.ReactElement {
  const { t } = deps
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(title)
  if (renaming) {
    return (
      <div className={css.sessionRow} data-current={current || undefined}>
        <input
          className={css.renameInput}
          autoFocus
          value={draft}
          onChange={(e) => { setDraft(e.target.value) }}
          onBlur={() => { setRenaming(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim() !== '') { void deps.renameSession(sessionId, draft.trim()) }
            if (e.key === 'Enter' || e.key === 'Escape') setRenaming(false)
          }}
        />
      </div>
    )
  }
  return (
    <div className={css.sessionRow} data-current={current || undefined}>
      <button type="button" className={css.sessionButton} disabled={archiving} onClick={() => { deps.open(sessionId) }}>
        <SessionIcon className={css.sessionIcon} />
        <span className={css.sessionTitle}>{title}</span>
      </button>
      <div className={css.rowActions}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('session.rename')}
          title={t('session.rename')}
          disabled={archiving}
          onClick={() => { setRenaming(true); setDraft(title) }}
        >
          <span className={css.editIcon} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('session.archive')}
          title={t('session.archive')}
          disabled={archiving}
          onClick={onArchive}
        >
          {archiving ? <span className={css.loadingSpinner} aria-hidden="true" /> : <span className={css.deleteIcon} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

/** The workspace view body: New Session bar, workspace cards, Add prompt, delete confirm. */
export function WorkBase(props: WorkBaseProps): React.ReactElement {
  const { t } = props
  const workspaces = props.useWorkspaces((s: WorkspaceSnapshot) => s.items, Object.is)
  const archivedSessionIds = props.useWorkspaces((s: WorkspaceSnapshot) => s.archivedSessionIds, Object.is)
  const archivedSessionSet = new Set(archivedSessionIds)
  const byId = props.useSessions((s: SessionListState) => s.byId, Object.is)
  const current = props.useSessions((s: SessionListState) => s.current)
  const [expanded, setExpanded] = useState<WorkspaceId | undefined>(workspaces[0]?.workspaceId)
  useEffect(() => {
    if (current === undefined) return
    const activeWorkspace = workspaces.find(workspace => workspace.sessionIds.includes(current))
    if (activeWorkspace !== undefined) setExpanded(activeWorkspace.workspaceId)
  }, [current, workspaces])
  const [adding, setAdding] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  const [addError, setAddError] = useState<string | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceView | undefined>(undefined)
  const [archiveTarget, setArchiveTarget] = useState<SessionId | undefined>(undefined)
  const [archivingSessionIds, setArchivingSessionIds] = useState<ReadonlySet<SessionId>>(new Set())
  const [optimisticallyArchivedIds, setOptimisticallyArchivedIds] = useState<ReadonlySet<SessionId>>(new Set())
  const [archiveError, setArchiveError] = useState<string | undefined>(undefined)
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceId | undefined>(undefined)
  const [renameDraft, setRenameDraft] = useState('')

  const archiveSession = async (sessionId: SessionId): Promise<void> => {
    setArchivingSessionIds(previous => new Set(previous).add(sessionId))
    setArchiveError(undefined)
    try {
      await props.archiveSession(sessionId)
      setOptimisticallyArchivedIds(previous => new Set(previous).add(sessionId))
    } catch {
      setArchiveError(t('session.archiveFailed'))
    } finally {
      setArchivingSessionIds((previous) => {
        const next = new Set(previous)
        next.delete(sessionId)
        return next
      })
    }
  }

  const sessionTitles = (sessionIds: readonly SessionId[]): { id: SessionId; title: string }[] =>
    sessionIds
      .filter(id => !optimisticallyArchivedIds.has(id) && !archivedSessionSet.has(id))
      .map(id => byId[id])
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .map(s => ({ id: s.id, title: s.displayTitle }))

  return (
    <div className={css.root}>
      <div className={css.list}>
        {workspaces.length === 0 && <div className={css.empty}>{t('workspace.empty')}</div>}
        {workspaces.map((workspace: WorkspaceView) => (
          <WorkspaceCard
            key={workspace.workspaceId}
            workspace={workspace}
            sessions={sessionTitles(workspace.sessionIds)}
            current={current}
            archivingSessionIds={archivingSessionIds}
            onArchive={(sessionId) => { setArchiveTarget(sessionId) }}
            expanded={expanded === workspace.workspaceId}
            onToggle={() => { setExpanded(expanded === workspace.workspaceId ? undefined : workspace.workspaceId) }}
            onNewSession={() => { props.startSession(workspace.workspaceId) }}
            onRename={() => { setRenamingWorkspace(workspace.workspaceId); setRenameDraft(workspace.title) }}
            onDelete={() => { setConfirmDelete(workspace) }}
            deps={{ ...props }}
          />
        ))}
        {renamingWorkspace !== undefined && (
          <div className={css.addRow}>
            <input
              className={css.pathInput}
              autoFocus
              value={renameDraft}
              onChange={(e) => { setRenameDraft(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameDraft.trim() !== '') {
                  void props.renameWorkspace(renamingWorkspace, renameDraft.trim())
                }
                if (e.key === 'Enter' || e.key === 'Escape') setRenamingWorkspace(undefined)
              }}
            />
          </div>
        )}
      </div>
      {adding ? (
        <div className={css.addRow}>
          <span className={css.loadingSpinner} aria-hidden="true" />
          <span className={css.addingHint}>{t('workspace.add')}</span>
        </div>
      ) : (
        <button type="button" className={css.addWorkspace} aria-label={t('workspace.add')} title={t('workspace.add')} onClick={() => {
          setAddError(undefined)
          setFlowOpen(true)
        }}>
          <span className={css.newIcon} aria-hidden="true" />
        </button>
      )}
      {props.renderSlot('studio.workspace.directoryFlow', {
        open: flowOpen,
        busy: adding,
        onPicked: (path) => {
          setAdding(true)
          void props.createWorkspace({ path }).then(() => {
            setFlowOpen(false)
          }).catch(() => {
            setAddError(t('workspace.addFailed'))
          }).finally(() => { setAdding(false) })
        },
        onCancel: () => { setFlowOpen(false) },
        onError: (message) => {
          setFlowOpen(false)
          setAddError(message)
        },
      } satisfies DirectoryFlowOwnerProps)}
      {addError !== undefined && <div className={css.operationError} role="status">{addError}</div>}
      {archiveError !== undefined && <div className={css.operationError} role="status">{archiveError}</div>}
      {archiveTarget !== undefined && (
        <Modal
          open
          title={t('session.archiveConfirmTitle')}
          description={t('session.archiveConfirmBody')}
          closeLabel={t('session.archiveConfirmCancel')}
          footer={(
            <button type="button" className={css.dangerButton} onClick={() => {
              const target = archiveTarget
              setArchiveTarget(undefined)
              void archiveSession(target)
            }}>
              {t('session.archiveConfirmOk')}
            </button>
          )}
          onClose={() => { setArchiveTarget(undefined) }}
        />
      )}
      {confirmDelete !== undefined && (
        <Modal
          open
          title={t('workspace.deleteConfirmTitle')}
          description={t('workspace.deleteConfirmBody')}
          closeLabel={t('workspace.deleteConfirmCancel')}
          footer={(
            <button
              type="button"
              className={css.dangerButton}
              onClick={() => { void props.deleteWorkspace(confirmDelete.workspaceId); setConfirmDelete(undefined) }}
            >
              {t('workspace.deleteConfirmOk')}
            </button>
          )}
          onClose={() => { setConfirmDelete(undefined) }}
        />
      )}
    </div>
  )
}
