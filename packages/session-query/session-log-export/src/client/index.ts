/** Browser plugin owning ZIP download and Markdown copy state. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { SessionLogDownloadController } from './controller.ts'
import { SessionMarkdownCopyController } from './copy-controller.ts'
import { SessionMarkdownCopyToast, type SessionMarkdownCopyToastInjected } from './CopyToast.tsx'
import { SessionLogDownloadHeaderAction } from './HeaderAction.tsx'
import type { SessionLogDownloadDialogInjected } from './Dialog.tsx'
import { en, ja, es, fr, de, ru, pt, NS, zh, type SessionLogDownloadKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLogDownload: SessionLogDownloadController
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-log-download': SessionLogDownloadKey
  }
}

export type { SessionLogDownloadEntry, SessionLogDownloadState } from './controller.ts'

export const inject = ['slots', 'locale']

/**
 * Provide both controllers, mount the copy toast and the dialog-only header
 * entry, and route the `/export` and `/copy` commands to their browser actions.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const controller = new SessionLogDownloadController()
  const copyController = new SessionMarkdownCopyController()
  ctx.provide('sessionLogDownload', controller)
  ctx.effect(() => async () => { await controller.dispose() }, 'session-log-download: browser download lifecycle')
  ctx.effect(() => async () => { await copyController.dispose() }, 'session-log-download: browser Markdown copy lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'session-log-download: browser dictionaries')
  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (result.kind !== 'success') return
    if (commandName === 'export') void controller.download(sessionId)
    else if (commandName === 'copy') void copyController.copy(sessionId)
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'session-log-download.copy-toast',
    locale: NS,
    inject: (): SessionMarkdownCopyToastInjected => ({
      hooks: { sessionMarkdownCopy: copyController.store },
      dismiss: () => { copyController.dismiss() },
    }),
  }, SessionMarkdownCopyToast))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'session-log-download',
    locale: NS,
    inject: (): SessionLogDownloadDialogInjected => ({
      hooks: { sessionLogDownload: controller.store },
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
    }),
  }, SessionLogDownloadHeaderAction))
}

export type { SessionLogDownloadDialogInjected, SessionLogDownloadDialogProps } from './Dialog.tsx'
