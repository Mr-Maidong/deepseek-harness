/**
 * The chat file-open gesture as Studio owns it: a conversation file click opens
 * the universal preview card instead of the right Sidebar. The seam is the
 * `chatFileOpener` service ui-chat reads through `ctx.get`; providing it here is
 * the on state, and a composition without this package keeps the Sidebar route.
 *
 * Paths arrive exactly as the conversation authored them — absolute or
 * Workspace-relative — so the opener resolves a relative path against the
 * viewed Session's workspace root before the bounded read, which takes fully
 * qualified paths only. The card then follows one flow for every producer
 * (`openPreview`): it opens in its loading state, the read settles it to content
 * or error, and a line travels to the card as its focus — the same channel a
 * search jump uses. A produced HTML file opens as a rendered artifact on the
 * card's 16:9 stage, a media file opens in the card's own player, and a binary
 * format the card cannot render opens on its refusal — the same kinds the file
 * tree and header search pick for that path.
 * A failed read leaves the card showing its own error state and rejects with
 * the reason, which the chat view surfaces as its open-error dialog.
 */
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { ChatFileOpener } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { previewKindFor } from '../frame/contract.ts'
import { openPreview, type PreviewPublish, type PreviewTextRead } from './open-preview.ts'

/** Reported when no workspace root can qualify a relative path. */
const NO_WORKSPACE = 'ui-studio: the viewed session has no workspace root to open the file under'

/** Whether a path is absolute in either spelling the Host accepts. */
function isFullyQualified(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[/\\]/u.test(path) || path.startsWith('\\\\')
}

/** Resolve the viewed Session's workspace root, or undefined when unknown. */
export type OpenerCwdFor = (sessionId: SessionId) => string | undefined

/** Everything the opener reaches, so the component layer keeps plain callbacks. */
export interface ChatFileOpenerOptions {
  readonly readFile: PreviewTextRead
  readonly publish: PreviewPublish
  readonly cwdFor: OpenerCwdFor
}

/**
 * Build the opener ui-chat hands every chat file gesture to.
 * @param options - the preview read, the frame publication, and the Session lookup.
 * @returns the seam implementation to provide as `chatFileOpener`.
 */
export function createChatFileOpener(options: ChatFileOpenerOptions): ChatFileOpener {
  const { readFile, publish, cwdFor } = options
  return {
    async open(sessionId, path, line) {
      const resolved = resolveWorkspacePath(cwdFor(sessionId), path)
      // A relative path needs a root to become readable; without one there is
      // nothing to open, and the card says so rather than reading a wrong name.
      if (!isFullyQualified(resolved)) {
        // The published kind still classifies the path, so a refused binary says
        // so here too instead of claiming a read failed.
        publish({ path: resolved, status: 'error', kind: previewKindFor(resolved) })
        throw new Error(NO_WORKSPACE)
      }
      await openPreview(readFile, publish, resolved, line)
    },
  }
}
