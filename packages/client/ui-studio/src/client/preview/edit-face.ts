/**
 * The preview card's edit face: the read that fills the edit buffer, the write
 * that saves it, and the re-read that refreshes the frame's preview afterwards.
 *
 * The card is a root-scoped seat, so the session whose workspace resolves the
 * edited path is resolved per call by the caller and the frame's preview store
 * is republished through the caller's publish callback. Keeping the Remote
 * contract in one place leaves the components with plain props and makes the
 * conflict rule — a file that changed since the buffer was read is refused —
 * testable without the slot runtime.
 */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { StudioPreview } from '../frame/contract.ts'
import type { PreviewCardInjected } from './PreviewCard.tsx'

/** The workspace-file verbs the edit face calls. */
type WorkspaceFilesRemote = Pick<ClientRemote['workspaceFiles'], 'readAll' | 'write'>

/** Everything the edit face reaches, so the card itself touches no service. */
export interface PreviewEditFaceOptions {
  /** The Remote face carrying the workspace-file read and write. */
  readonly workspaceFiles: WorkspaceFilesRemote
  /** The session whose workspace resolves the edited path; throws when none is open. */
  readonly session: () => SessionId
  /** Publish a refreshed preview into the frame's preview store. */
  readonly publish: (preview: StudioPreview) => void
  /** The ordinary preview read, used to refresh the card after a successful write. */
  readonly readFile: (path: string) => Promise<{ content: string; language?: string }>
}

/**
 * Build the card's edit callbacks over one Remote face.
 * @param options - the workspace-file face, the session resolver, and the preview publication.
 * @returns the injected edit callbacks.
 */
export function createPreviewEditFace(
  options: PreviewEditFaceOptions,
): Pick<PreviewCardInjected, 'loadForEdit' | 'saveEdit' | 'reloadPreview'> {
  const { workspaceFiles, session, publish, readFile } = options
  return {
    loadForEdit: async (path) => {
      const result = await workspaceFiles.readAll(session(), path)
      if (!result.ok) throw new Error(result.error.message)
      return { text: decodeBase64Text(result.value.data), version: result.value.version }
    },
    saveEdit: async (path, text, version) => {
      const result = await workspaceFiles.write(session(), path, { text, version })
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
