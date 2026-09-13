/**
 * The preview card's edit face: the workspace-file read and write behind the
 * card, including the Session the edit runs under (waited for, because a reload
 * restores the card before the Session list arrives) and the version guard that
 * refuses to overwrite a file that changed since the buffer was read.
 */
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createPreviewEditFace, decodeBase64Text, type PreviewEditFaceOptions, type SessionSelection } from '../src/client/preview/edit-face.ts'

const SESSION = SessionId('s-edit')
const PATH = '/workspace/main.ts'

/** One controllable Session-list snapshot store. */
function sessionList(initial: { current?: SessionId; phase?: 'pending' | 'ready' } = {}, settleOnSubscribe = false) {
  let snapshot = {
    current: initial.current as SessionId | undefined,
    phase: initial.phase ?? 'ready' as 'pending' | 'ready',
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      // A store may publish while a consumer is still subscribing, before the
      // disposer it would unsubscribe with exists.
      if (settleOnSubscribe) {
        snapshot = { ...snapshot, current: SESSION, phase: 'ready' }
        listener()
      }
      return () => { listeners.delete(listener) }
    },
    /** Publish the next snapshot, as the Session list does on arrival. */
    set(next: Partial<typeof snapshot>): void {
      snapshot = { ...snapshot, ...next }
      for (const listener of [...listeners]) listener()
    },
  }
}

/** One face over recording Remote verbs; overrides replace one member's answer. */
function face(overrides: Partial<PreviewEditFaceOptions> = {}, sessions: SessionSelection = sessionList({ current: SESSION })) {
  const workspaceFiles = {
    readAll: vi.fn(async () => ({ ok: true as const, value: { absolutePath: PATH, version: 'v1', offset: 0, data: btoa('export {}'), eof: true } })),
    write: vi.fn(async () => ({ ok: true as const, value: { absolutePath: PATH, version: 'v2' } })),
  }
  const publish = vi.fn()
  const readFile = vi.fn(async () => ({ content: 'export {}', language: 'typescript' }))
  const edit = createPreviewEditFace({ workspaceFiles, publish, readFile, sessions, ...overrides })
  return { edit, workspaceFiles, publish, readFile }
}

describe('createPreviewEditFace', () => {
  it('decodes the complete file and hands back the version the buffer is based on', async () => {
    const { edit, workspaceFiles } = face()
    await expect(edit.loadForEdit?.(PATH)).resolves.toEqual({ text: 'export {}', version: 'v1' })
    expect(workspaceFiles.readAll).toHaveBeenCalledWith(SESSION, PATH)
  })

  it('waits for the Session list a reload restores the card before, instead of reporting a failure', async () => {
    // The regression this covers: the frame store restores the preview from
    // localStorage while the Session list is still pending, so the first read
    // used to fail and the user had to press reload by hand.
    const sessions = sessionList({ phase: 'pending' })
    const { edit, workspaceFiles } = face({}, sessions)
    let settled = false
    const read = edit.loadForEdit?.(PATH).then((buffer) => { settled = true; return buffer })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(workspaceFiles.readAll).not.toHaveBeenCalled()
    // A publish that decides nothing leaves the read waiting.
    sessions.set({ phase: 'pending' })
    await Promise.resolve()
    expect(settled).toBe(false)
    sessions.set({ current: SESSION, phase: 'ready' })
    await expect(read).resolves.toEqual({ text: 'export {}', version: 'v1' })
    expect(workspaceFiles.readAll).toHaveBeenCalledWith(SESSION, PATH)
  })

  it('reports an unselected Session once the list has arrived', async () => {
    const arrived = face({}, sessionList({ phase: 'ready' }))
    await expect(arrived.edit.loadForEdit?.(PATH)).rejects.toThrow('no session is open')
    expect(arrived.workspaceFiles.readAll).not.toHaveBeenCalled()
  })

  it('reports a list that arrives without a Session while the read waits', async () => {
    const sessions = sessionList({ phase: 'pending' })
    const { edit, workspaceFiles } = face({}, sessions)
    const waiting = edit.loadForEdit?.(PATH)
    await Promise.resolve()
    sessions.set({ phase: 'ready' })
    await expect(waiting).rejects.toThrow('no session is open')
    expect(workspaceFiles.readAll).not.toHaveBeenCalled()
  })

  it('settles when the list arrives while the subscription is still being taken', async () => {
    const { edit, workspaceFiles } = face({}, sessionList({ phase: 'pending' }, true))
    await expect(edit.loadForEdit?.(PATH)).resolves.toEqual({ text: 'export {}', version: 'v1' })
    expect(workspaceFiles.readAll).toHaveBeenCalledWith(SESSION, PATH)
  })

  it('keeps the first verdict when the list publishes again after it settled', async () => {
    const sessions = sessionList({ phase: 'pending' })
    const { edit } = face({}, sessions)
    const read = edit.loadForEdit?.(PATH)
    await Promise.resolve()
    sessions.set({ current: SESSION, phase: 'ready' })
    await expect(read).resolves.toEqual({ text: 'export {}', version: 'v1' })
    // A later publish neither rejects nor resolves a second time.
    sessions.set({ current: undefined, phase: 'ready' })
    await expect(read).resolves.toEqual({ text: 'export {}', version: 'v1' })
  })

  it('waits for the same Session before writing', async () => {
    const sessions = sessionList({ phase: 'pending' })
    const { edit, workspaceFiles } = face({}, sessions)
    const saved = edit.saveEdit?.(PATH, 'mine', 'v1')
    await Promise.resolve()
    expect(workspaceFiles.write).not.toHaveBeenCalled()
    sessions.set({ current: SESSION, phase: 'ready' })
    await expect(saved).resolves.toEqual({ ok: true, version: 'v2' })
    expect(workspaceFiles.write).toHaveBeenCalledWith(SESSION, PATH, { text: 'mine', version: 'v1' })
  })

  it('decodes multibyte UTF-8 backing a base64 window', () => {
    expect(decodeBase64Text(Buffer.from('引入\n', 'utf8').toString('base64'))).toBe('引入\n')
    expect(decodeBase64Text('')).toBe('')
  })

  it('reports the Host message when the buffer read is refused', async () => {
    const { edit } = face({
      workspaceFiles: {
        readAll: vi.fn(async () => ({ ok: false as const, error: { code: 'workspace-file/too-large', message: 'exceeds the cap' } })),
        write: vi.fn(),
      } as unknown as PreviewEditFaceOptions['workspaceFiles'],
    })
    await expect(edit.loadForEdit?.(PATH)).rejects.toThrow('exceeds the cap')
  })

  it('writes the complete text with the version it was based on, and reports the version it produced', async () => {
    const { edit, workspaceFiles } = face()
    await expect(edit.saveEdit?.(PATH, 'export const x = 1', 'v1')).resolves.toEqual({ ok: true, version: 'v2' })
    expect(workspaceFiles.write).toHaveBeenCalledWith(SESSION, PATH, { text: 'export const x = 1', version: 'v1' })
  })

  it('separates a version conflict from any other refused write', async () => {
    const conflict = face({
      workspaceFiles: {
        readAll: vi.fn(),
        write: vi.fn(async () => ({ ok: false as const, error: { code: 'workspace-file/version-conflict', message: 'changed' } })),
      } as unknown as PreviewEditFaceOptions['workspaceFiles'],
    })
    await expect(conflict.edit.saveEdit?.(PATH, 'mine', 'v1')).resolves.toEqual({ ok: false, conflict: true })
    const refused = face({
      workspaceFiles: {
        readAll: vi.fn(),
        write: vi.fn(async () => ({ ok: false as const, error: { code: 'workspace-file/too-large', message: 'too big' } })),
      } as unknown as PreviewEditFaceOptions['workspaceFiles'],
    })
    await expect(refused.edit.saveEdit?.(PATH, 'mine', 'v1')).resolves.toEqual({ ok: false, conflict: false })
  })

  it('republishes the saved file through the ordinary preview read', async () => {
    const { edit, publish, readFile } = face()
    edit.reloadPreview?.(PATH)
    await vi.waitFor(() => {
      expect(publish).toHaveBeenCalledWith({ path: PATH, status: 'ready', kind: 'code', content: 'export {}', language: 'typescript' })
    })
    expect(readFile).toHaveBeenCalledWith(PATH)
  })

  it('omits the language a read reports nothing for, and republishes a failed read as an error preview', async () => {
    const noLanguage = face({ readFile: vi.fn(async () => ({ content: 'plain' })) })
    noLanguage.edit.reloadPreview?.(PATH)
    await vi.waitFor(() => {
      expect(noLanguage.publish).toHaveBeenCalledWith({ path: PATH, status: 'ready', kind: 'code', content: 'plain' })
    })
    const failed = face({ readFile: vi.fn(async () => { throw new Error('gone') }) })
    failed.edit.reloadPreview?.(PATH)
    await vi.waitFor(() => {
      expect(failed.publish).toHaveBeenCalledWith({ path: PATH, status: 'error', kind: 'code' })
    })
  })
})
