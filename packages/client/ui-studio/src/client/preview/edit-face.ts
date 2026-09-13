/**
 * The preview card's edit face: the read that fills the edit buffer, the write
 * that saves it, and the re-read that refreshes the frame's preview afterwards.
 *
 * The card is a root-scoped seat, so the Session whose workspace resolves the
 * edited path comes from the Session list on every call, and the frame's
 * preview store is republished through the caller's publish callback. Keeping
 * the Remote contract in one place leaves the components with plain props and
 * makes two rules testable without the slot runtime: a read waits for the
 * Session list a reload restores the card before, and a file that changed since
 * the buffer was read is refused instead of overwritten.
 */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StudioPreview } from '../frame/contract.ts'
import type { PreviewCardInjected } from './PreviewCard.tsx'

/** Reported when the Session list has arrived without a selected Session. */
const NO_SESSION = 'ui-studio: no session is open for this preview'

/** The workspace-file verbs the edit face calls. */
type WorkspaceFilesRemote = Pick<ClientRemote['workspaceFiles'], 'readAll' | 'write'>

/** The slice of the Session list the edit face resolves the edited path against. */
export interface SessionSelection {
  /**
   * Read the current selection.
   * @returns the selected Session, and the list's arrival lifecycle, where
   *   `ready` without a Session means there is none to edit under.
   */
  getSnapshot(): {
    readonly current: SessionId | undefined
    readonly phase: 'pending' | 'ready'
  }
  /**
   * Observe selection changes.
   * @param listener - called after every snapshot change.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void
}

/** Everything the edit face reaches, so the card itself touches no service. */
export interface PreviewEditFaceOptions {
  /** The Remote face carrying the workspace-file read and write. */
  readonly workspaceFiles: WorkspaceFilesRemote
  /** The Session list the edit runs under; the frame store restores a preview before this list arrives. */
  readonly sessions: SessionSelection
  /** Publish a refreshed preview into the frame's preview store. */
  readonly publish: (preview: StudioPreview) => void
  /** The ordinary preview read, used to refresh the card after a successful write. */
  readonly readFile: (path: string) => Promise<{ content: string; language?: string }>
}

/**
 * Build the card's edit callbacks over one Remote face.
 * @param options - the workspace-file face, the Session list, and the preview publication.
 * @returns the injected edit callbacks.
 */
export function createPreviewEditFace(
  options: PreviewEditFaceOptions,
): Pick<PreviewCardInjected, 'loadForEdit' | 'saveEdit' | 'reloadPreview'> {
  const { workspaceFiles, sessions, publish, readFile } = options
  // A page reload restores the card from the frame store before the Session list
  // has arrived, so the first read waits for the list instead of reporting a
  // failure the user has to retry by hand; once the list is in, an unselected
  // Session is a real answer and the read fails.
  const session = (): Promise<SessionId> => {
    // The verdict this snapshot carries: a selected Session, a settled list
    // without one, or nothing to decide yet.
    const verdict = (): { session?: SessionId; decided: boolean } => {
      const now = sessions.getSnapshot()
      if (now.current !== undefined) return { session: now.current, decided: true }
      // An arrived list without a selection is "truly no sessions", so the read
      // fails; a list still on its way is waited for.
      if (now.phase === 'ready') return { decided: true }
      return { decided: false }
    }
    const first = verdict()
    if (first.decided) {
      return first.session === undefined
        ? Promise.reject(new Error(NO_SESSION))
        : Promise.resolve(first.session)
    }
    return new Promise<SessionId>((resolve, reject) => {
      // The disposer sits in a holder, not a binding: a store that publishes
      // while `subscribe` is still running reaches `settle` before the
      // assignment below completes, and the check after it removes that
      // subscription. The listener is removed at the first decided snapshot.
      const subscription: { stop?: () => void } = {}
      let settled = false
      const settle = (session: SessionId | undefined): void => {
        settled = true
        subscription.stop?.()
        if (session === undefined) reject(new Error(NO_SESSION))
        else resolve(session)
      }
      // No window exists between the read above and this subscription: both are
      // synchronous, so a list that settles in between notifies this listener.
      subscription.stop = sessions.subscribe(() => {
        const next = verdict()
        if (next.decided) settle(next.session)
      })
      if (settled) subscription.stop()
    })
  }
  return {
    loadForEdit: async (path) => {
      const result = await workspaceFiles.readAll(await session(), path)
      if (!result.ok) throw new Error(result.error.message)
      return { text: decodeBase64Text(result.value.data), version: result.value.version }
    },
    saveEdit: async (path, text, version) => {
      const result = await workspaceFiles.write(await session(), path, { text, version })
      if (!result.ok) return { ok: false, conflict: result.error.code === 'workspace-file/version-conflict' }
      return { ok: true, version: result.value.version }
    },
    reloadPreview: (path) => {
      void readFile(path).then(({ content, language }) => {
        publish({ path, status: 'ready', kind: 'code', content, ...(language === undefined ? {} : { language }) })
      }).catch(() => {
        publish({ path, status: 'error', kind: 'code' })
      })
    },
  }
}

/**
 * Decode the base64 byte window `workspaceFiles` returns as UTF-8 text.
 * @param data - base64-encoded file bytes.
 * @returns the decoded file text.
 */
export function decodeBase64Text(data: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(data), char => char.charCodeAt(0)))
}
