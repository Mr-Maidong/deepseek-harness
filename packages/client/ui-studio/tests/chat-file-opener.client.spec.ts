/**
 * The chat file-open gesture as Studio owns it: a conversation path opens the
 * universal preview card through the frame store instead of the right Sidebar.
 * The face covers the three things the seam decides — a relative path becomes
 * fully qualified under the viewed Session's workspace root before the read,
 * the card follows its loading → ready flow with the line as focus, and a failed
 * read leaves the card in its error state while the rejection travels back to
 * the chat view's open-error dialog.
 */
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createChatFileOpener, type ChatFileOpenerOptions } from '../src/client/preview/chat-opener.ts'
import type { StudioPreview } from '../src/client/frame/contract.ts'

const SESSION = SessionId('s-chat')
const ROOT = '/work/demo'

/** One opener over recording read/publish; overrides replace one member. */
function opener(overrides: Partial<ChatFileOpenerOptions> = {}) {
  const readFile = vi.fn(async () => ({ content: 'export {}\n', language: 'typescript' }))
  const publish = vi.fn<(preview: StudioPreview) => void>()
  const cwdFor = vi.fn(() => ROOT)
  const face = createChatFileOpener({ readFile, publish, cwdFor, ...overrides })
  return { face, readFile, publish, cwdFor }
}

describe('createChatFileOpener', () => {
  it('opens a relative conversation path under the viewed Session\'s workspace root', async () => {
    const { face, readFile, publish, cwdFor } = opener()
    await face.open(SESSION, 'src/a.ts')

    expect(cwdFor).toHaveBeenCalledWith(SESSION)
    // The bounded read takes fully qualified paths only, so the card and the
    // search jump share one file identity with the tree.
    expect(readFile).toHaveBeenCalledWith('/work/demo/src/a.ts')
    expect(publish).toHaveBeenNthCalledWith(1, { path: '/work/demo/src/a.ts', status: 'loading', kind: 'code' })
    expect(publish).toHaveBeenNthCalledWith(2, {
      path: '/work/demo/src/a.ts', status: 'ready', kind: 'code', content: 'export {}\n', language: 'typescript',
    })
  })

  it('keeps an absolute path authored by the conversation as written', async () => {
    const { face, readFile } = opener()
    await face.open(SESSION, '/elsewhere/notes.md')
    expect(readFile).toHaveBeenCalledWith('/elsewhere/notes.md')
  })

  it('lands the card on the line the gesture named, as a search-jump focus', async () => {
    const { face, publish } = opener()
    await face.open(SESSION, 'src/a.ts', 42)
    expect(publish).toHaveBeenLastCalledWith({
      path: '/work/demo/src/a.ts', status: 'ready', kind: 'code', content: 'export {}\n',
      focus: { line: 42, column: 1 }, language: 'typescript',
    })
  })

  it('omits the language label a read reports nothing for', async () => {
    const { face, publish } = opener({ readFile: async () => ({ content: 'plain' }) })
    await face.open(SESSION, '/work/demo/notes.txt')
    expect(publish).toHaveBeenLastCalledWith({
      path: '/work/demo/notes.txt', status: 'ready', kind: 'code', content: 'plain',
    })
  })

  it('publishes the error card and rejects with the reason when the read fails', async () => {
    const { face, publish } = opener({ readFile: async () => { throw new Error('file is not a readable preview') } })
    await expect(face.open(SESSION, '/work/demo/gone.ts')).rejects.toThrow('file is not a readable preview')
    expect(publish).toHaveBeenLastCalledWith({ path: '/work/demo/gone.ts', status: 'error', kind: 'code' })
  })

  it('opens produced HTML as a rendered artifact rather than source', async () => {
    const { face, publish } = opener({ readFile: async () => ({ content: '<h1>hi</h1>', language: 'html' }) })
    await face.open(SESSION, 'report.html')
    // The kind comes from the path before the read, so loading already sizes the
    // card as the 16:9 stage and the settled state does not resize it.
    expect(publish).toHaveBeenNthCalledWith(1, { path: '/work/demo/report.html', status: 'loading', kind: 'iframe' })
    // A rendered artifact embeds its document, so it carries no language label.
    expect(publish).toHaveBeenNthCalledWith(2, { path: '/work/demo/report.html', status: 'ready', kind: 'iframe', content: '<h1>hi</h1>' })
  })

  it('drops the focus line for a rendered artifact a tool row named a line in', async () => {
    const { face, publish } = opener({ readFile: async () => ({ content: '<p>x</p>' }) })
    await face.open(SESSION, '/work/demo/page.htm', 12)
    // There is no line grid to land on, so the gesture's line never reaches the card.
    expect(publish).toHaveBeenLastCalledWith({ path: '/work/demo/page.htm', status: 'ready', kind: 'iframe', content: '<p>x</p>' })
  })

  it('settles a failed HTML read on the iframe error card', async () => {
    const { face, publish } = opener({ readFile: async () => { throw new Error('denied') } })
    await expect(face.open(SESSION, '/work/demo/broken.html')).rejects.toThrow('denied')
    expect(publish).toHaveBeenNthCalledWith(1, { path: '/work/demo/broken.html', status: 'loading', kind: 'iframe' })
    expect(publish).toHaveBeenLastCalledWith({ path: '/work/demo/broken.html', status: 'error', kind: 'iframe' })
  })

  it('refuses a relative path when the viewed Session has no workspace root', async () => {
    const { face, readFile, publish } = opener({ cwdFor: () => undefined })
    await expect(face.open(SESSION, 'src/a.ts')).rejects.toThrow(/no workspace root/u)
    // Nothing half-resolved reaches the read, and the card shows the failure.
    expect(readFile).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledWith({ path: 'src/a.ts', status: 'error', kind: 'code' })
  })
})
