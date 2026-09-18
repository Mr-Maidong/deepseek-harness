/**
 * The preview card's media face: the read that fetches a media file's complete
 * bytes for the card to play.
 *
 * The card owns this read because the bytes must not enter the frame's persisted
 * preview store, and it owns the object URL's lifetime for the same reason. The
 * Session resolution is the edit face's, so a media preview restored from
 * browser storage waits for the Session list before its first read.
 */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { decodeBase64Bytes } from './base64.ts'
import { resolveSelectedSession, type SessionSelection } from './session-selection.ts'
import type { MediaLoadResult, PreviewCardInjected } from './PreviewCard.tsx'

/** The workspace-file verb the media face calls. */
type WorkspaceFilesRemote = Pick<ClientRemote['workspaceFiles'], 'readAll'>

/** Everything the media face reaches, so the card itself touches no service. */
export interface PreviewMediaFaceOptions {
  /** The Remote face carrying the workspace-file read. */
  readonly workspaceFiles: WorkspaceFilesRemote
  /** The Session list the read runs under; the frame store restores a preview before this list arrives. */
  readonly sessions: SessionSelection
}

/**
 * Build the card's media read over one Remote face.
 * @param options - the workspace-file face and the Session list.
 * @returns the injected media read.
 */
export function createPreviewMediaFace(
  options: PreviewMediaFaceOptions,
): Pick<PreviewCardInjected, 'loadMedia'> {
  const { workspaceFiles, sessions } = options
  return {
    loadMedia: async (path): Promise<MediaLoadResult> => {
      const result = await workspaceFiles.readAll(await resolveSelectedSession(sessions), path)
      if (!result.ok) {
        // A file past the Host's complete-file cap is the refusal worth its own
        // message: it is the ordinary case for a long video.
        return { ok: false, reason: result.error.code === 'workspace-file/too-large' ? 'too-large' : 'unavailable' }
      }
      return { ok: true, data: decodeBase64Bytes(result.value.data) }
    },
  }
}
