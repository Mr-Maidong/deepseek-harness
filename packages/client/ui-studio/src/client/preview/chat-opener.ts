/**
 * The chat file-open gesture as Studio owns it: a conversation file click opens
 * the universal preview card instead of the right Sidebar. The seam is the
 * `chatFileOpener` service ui-chat reads through `ctx.get`; providing it here is
 * the on state, and a composition without this package keeps the Sidebar route.
 *
 * Paths arrive exactly as the conversation authored them — absolute or
 * Workspace-relative — so the opener resolves a relative path against the
 * viewed Session's workspace root before the bounded read, which takes fully
 * qualified paths only. The card then follows one flow for every producer: it
 * opens in its loading state, the read settles it to content or error, and a
 * line travels to the card as its focus — the same channel a search jump uses.
 * A produced HTML file opens as a rendered artifact on the card's 16:9 stage,
 * the same kind the file tree and header search pick for that path.
 * A failed read leaves the card showing its own error state and rejects with
 * the reason, which the chat view surfaces as its open-error dialog.
 */
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { ChatFileOpener } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { previewKindFor, type StudioPreview } from '../frame/contract.ts'

/** Reported when no workspace root can qualify a relative path. */
const NO_WORKSPACE = 'ui-studio: the viewed session has no workspace root to open the file under'

/** Whether a path is absolute in either spelling the Host accepts. */
function isFullyQualified(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[/\\]/u.test(path) || path.startsWith('\\\\')
}

/** Read one file's text for the card; the path is fully qualified. */
export type OpenerReadFile = (path: string) => Promise<{ content: string; language?: string }>

/** Publish a preview state into the frame's store. */
export type OpenerPublish = (preview: StudioPreview) => void

/** Resolve the viewed Session's workspace root, or undefined when unknown. */
export type OpenerCwdFor = (sessionId: SessionId) => string | undefined

/** Everything the opener reaches, so the component layer keeps plain callbacks. */
export interface ChatFileOpenerOptions {
  readonly readFile: OpenerReadFile
  readonly publish: OpenerPublish
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
        publish({ path: resolved, status: 'error', kind: previewKindFor(resolved) })
        throw new Error(NO_WORKSPACE)
      }
      await openPreview(readFile, publish, resolved, line)
    },
  }
}

/**
 * Open one fully qualified file through the shared card flow: the loading
 * publication, the read, and the settled ready/error publication. The kind comes
 * from the path before the read starts, so all three states size the card the
 * same way — a produced HTML file never flashes a full-height source surface on
 * its way to the 16:9 stage. A rendered artifact has no line grid, so the focus
 * line it was given travels only to a code buffer.
 * @param readFile - the bounded preview read.
 * @param publish - the frame-store publication.
 * @param path - the fully qualified file path.
 * @param line - 1-based line the card lands on, when the gesture named one.
 */
export async function openPreview(
  readFile: OpenerReadFile,
  publish: OpenerPublish,
  path: string,
  line?: number,
): Promise<void> {
  const kind = previewKindFor(path)
  publish({ path, status: 'loading', kind })
  try {
    const { content, language } = await readFile(path)
    publish(kind === 'iframe'
      ? { path, status: 'ready', kind, content }
      : {
        path,
        status: 'ready',
        kind,
        content,
        ...(line === undefined ? {} : { focus: { line, column: 1 } }),
        ...(language === undefined ? {} : { language }),
      })
  } catch (error) {
    publish({ path, status: 'error', kind })
    throw error
  }
}
