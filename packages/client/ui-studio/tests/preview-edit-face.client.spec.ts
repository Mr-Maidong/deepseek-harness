/**
 * The preview card's edit face: the workspace-file read and write behind the
 * card, including the version guard that refuses to overwrite a file that
 * changed since the buffer was read.
 */
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createPreviewEditFace, decodeBase64Text, type PreviewEditFaceOptions } from '../src/client/preview/edit-face.ts'

const SESSION = SessionId('s-edit')
const PATH = '/workspace/main.ts'

/** One face over recording Remote verbs; overrides replace one verb's answer. */
function face(overrides: Partial<PreviewEditFaceOptions> = {}) {
  const workspaceFiles = {
    readAll: vi.fn(async () => ({ ok: true as const, value: { absolutePath: PATH, version: 'v1', offset: 0, data: btoa('export {}'), eof: true } })),
    write: vi.fn(async () => ({ ok: true as const, value: { absolutePath: PATH, version: 'v2' } })),
  }
  const publish = vi.fn()
  const readFile = vi.fn(async () => ({ content: 'export {}', language: 'typescript' }))
  const session = vi.fn(() => SESSION)
  const edit = createPreviewEditFace({ workspaceFiles, publish, readFile, session, ...overrides })
  return { edit, workspaceFiles, publish, readFile, session }
}

describe('createPreviewEditFace', () => {
  it('decodes the complete file and hands back the version the buffer is based on', async () => {
    const { edit, workspaceFiles, session } = face()
    await expect(edit.loadForEdit?.(PATH)).resolves.toEqual({ text: 'export {}', version: 'v1' })
    expect(workspaceFiles.readAll).toHaveBeenCalledWith(SESSION, PATH)
    expect(session).toHaveBeenCalled()
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
