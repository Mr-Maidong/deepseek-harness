// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { SessionLogDownloadController } from '../src/client/controller.ts'
import { SessionLogDownloadHeaderAction } from '../src/client/HeaderAction.tsx'
import type { SessionLogDownloadHeaderProps } from '../src/client/HeaderAction.tsx'
import { en } from '../src/client/locales.ts'

const SID = 'session-export-header' as SessionId

function bindSnapshot<State>(store: ObservableSnapshot<State>) {
  return function useSnapshot<T>(selector: (state: State) => T): T {
    return useSyncExternalStore(
      listener => store.subscribe(listener),
      () => selector(store.getSnapshot()),
    )
  }
}

function bench() {
  const controller = new SessionLogDownloadController(async () => new Response('zip'), vi.fn())
  const dismiss = vi.fn((sessionId: SessionId) => { controller.dismiss(sessionId) })
  const props = {
    sessionId: SID,
    useSessionLogDownload: bindSnapshot(controller.store),
    dismiss,
    t: (key: keyof typeof en): string => en[key],
  } as unknown as SessionLogDownloadHeaderProps
  const view = render(<SessionLogDownloadHeaderAction {...props} />)
  return { controller, dismiss, view }
}

afterEach(cleanup)

describe('Session export Header action', () => {
  it('renders no header trigger', () => {
    const b = bench()
    // The overflow menu is gone: neither the trigger nor its menu reaches the
    // header's utility row any more.
    expect(b.view.queryByRole('button', { name: 'More actions' })).toBeNull()
    expect(b.view.queryByRole('menu')).toBeNull()
    expect(b.view.queryByRole('menuitem')).toBeNull()
    expect(b.view.container.querySelector('button')).toBeNull()
  })

  it('stays closed while no download is in flight', () => {
    const b = bench()
    expect(b.view.queryByRole('dialog')).toBeNull()
  })

  it('opens the dialog when the command plane starts a download', async () => {
    const b = bench()
    await act(async () => { await b.controller.download(SID) })
    await waitFor(() => {
      expect(b.view.getByRole('dialog', { name: 'Session download started' })).toBeTruthy()
    })
  })

  it('dismisses the dialog back through the injected action', async () => {
    const b = bench()
    await act(async () => { await b.controller.download(SID) })
    await waitFor(() => { expect(b.view.getByRole('dialog')).toBeTruthy() })
    await act(async () => { b.dismiss(SID) })
    await waitFor(() => { expect(b.view.queryByRole('dialog')).toBeNull() })
  })
})
