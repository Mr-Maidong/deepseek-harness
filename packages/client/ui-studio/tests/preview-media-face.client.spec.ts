/**
 * The preview card's media face: the workspace-file read behind the card's image
 * and video surfaces. The bytes stay out of the frame store, so this face is
 * where they come from, and the Session it reads under is the edit face's own
 * resolution — waited for, because a reload restores a media card before the
 * Session list arrives, and a settled list without a selection is a real
 * rejection the card maps to its unavailable message.
 */
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createPreviewMediaFace, type PreviewMediaFaceOptions } from '../src/client/preview/media-face.ts'
import type { SessionSelection } from '../src/client/preview/session-selection.ts'

const SESSION = SessionId('s-media')
const PATH = '/workspace/photo.png'

/** The bytes one base64 window stands for, compared structurally by the assertions. */
const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

/** One controllable Session-list snapshot store. */
function sessionList(initial: { current?: SessionId; phase?: 'pending' | 'ready' } = {}) {
  let snapshot: { current: SessionId | undefined; phase: 'pending' | 'ready' } = {
    current: initial.current,
    phase: initial.phase ?? 'ready',
  }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /** Publish the next snapshot, as the Session list does on arrival. */
    set(next: Partial<typeof snapshot>): void {
      snapshot = { ...snapshot, ...next }
      for (const listener of [...listeners]) listener()
    },
  }
}

/** One face over a recording Remote read; overrides replace its answer. */
function face(overrides: Partial<PreviewMediaFaceOptions> = {}, sessions: SessionSelection = sessionList({ current: SESSION })) {
  const workspaceFiles = {
    readAll: vi.fn(async () => ({
      ok: true as const,
      value: { absolutePath: PATH, version: 'v1', offset: 0, data: btoa('bytes'), eof: true },
    })),
  }
  const media = createPreviewMediaFace({ workspaceFiles, sessions, ...overrides })
  return { media, workspaceFiles }
}

describe('createPreviewMediaFace', () => {
  it('decodes the complete file into bytes for the Session it runs under', async () => {
    const { media, workspaceFiles } = face()
    await expect(media.loadMedia?.(PATH)).resolves.toEqual({ ok: true, data: bytes('bytes') })
    expect(workspaceFiles.readAll).toHaveBeenCalledWith(SESSION, PATH)
  })

  it('names the Host complete-file cap as its own reason', async () => {
    const { media } = face({
      workspaceFiles: {
        readAll: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'workspace-file/too-large', message: 'exceeds the cap' },
        })),
      } as unknown as PreviewMediaFaceOptions['workspaceFiles'],
    })
    await expect(media.loadMedia?.(PATH)).resolves.toEqual({ ok: false, reason: 'too-large' })
  })

  it('reports any other refused read as unavailable', async () => {
    const { media } = face({
      workspaceFiles: {
        readAll: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'workspace-file/not-found', message: 'no such file' },
        })),
      } as unknown as PreviewMediaFaceOptions['workspaceFiles'],
    })
    await expect(media.loadMedia?.(PATH)).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('waits for the Session list a reload restores the card before', async () => {
    const sessions = sessionList({ phase: 'pending' })
    const { media, workspaceFiles } = face({}, sessions)
    const read = media.loadMedia?.(PATH)
    await Promise.resolve()
    // A list still on its way is not "no session": the read waits instead of
    // reporting a failure the user would have to retry by hand.
    expect(workspaceFiles.readAll).not.toHaveBeenCalled()
    sessions.set({ current: SESSION, phase: 'ready' })
    await expect(read).resolves.toEqual({ ok: true, data: bytes('bytes') })
  })

  it('rejects when the settled Session list has no selection', async () => {
    const { media, workspaceFiles } = face({}, sessionList({ phase: 'ready' }))
    await expect(media.loadMedia?.(PATH)).rejects.toThrow('no session is open')
    expect(workspaceFiles.readAll).not.toHaveBeenCalled()
  })
})
