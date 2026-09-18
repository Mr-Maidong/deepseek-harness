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
import type { StudioPreview } from '../frame/contract.ts'
import { decodeBase64Text } from './base64.ts'
import { resolveSelectedSession, type SessionSelection } from './session-selection.ts'
import type { PreviewCardInjected } from './PreviewCard.tsx'

/** The workspace-file verbs the edit face calls. */
type WorkspaceFilesRemote = Pick<ClientRemote['workspaceFiles'], 'readAll' | 'write'>

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
  return {
    loadForEdit: async (path) => {
      const result = await workspaceFiles.readAll(await resolveSelectedSession(sessions), path)
      if (!result.ok) throw new Error(result.error.message)
      return { text: decodeBase64Text(result.value.data), version: result.value.version }
    },
    saveEdit: async (path, text, version) => {
      const result = await workspaceFiles.write(await resolveSelectedSession(sessions), path, { text, version })
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
