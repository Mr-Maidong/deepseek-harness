// @vitest-environment jsdom
// The card opens a workspace file as a line-numbered editor: the buffer is read
// with the version it is based on, Ctrl+S (or the Save control) writes it back
// under that version, and a file that changed underneath is refused rather than
// clobbered. The card also suppresses the browser's own context menu.
import type {} from '../src/client/index.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PreviewCard } from '../src/client/preview/PreviewCard.tsx'
import { zh } from '../src/client/left-panel/locales.ts'
import type { StudioPreview } from '../src/client/frame/contract.ts'

const t = makeTranslate(zh) as never
const PATH = '/workspace/main.ts'
const CONTENT = 'export {}\n'
const codePreview: StudioPreview = { path: PATH, status: 'ready', content: CONTENT, language: 'typescript', kind: 'code' }

/** The injected callbacks this card wires, in wiring order. */
const MEMBERS = ['insertReference', 'loadForEdit', 'saveEdit', 'reloadPreview'] as const

/** Render the card with recording injected callbacks; an override of `undefined` wires no such member. */
function card(overrides: Partial<Record<typeof MEMBERS[number], unknown>> = {}, preview: StudioPreview = codePreview) {
  const members: Record<typeof MEMBERS[number], ReturnType<typeof vi.fn>> = {
    insertReference: vi.fn(),
    loadForEdit: vi.fn(async () => ({ text: CONTENT, version: 'v1' })),
    saveEdit: vi.fn(async () => ({ ok: true, version: 'v2' })),
    reloadPreview: vi.fn(),
  }
  const wired: Record<string, unknown> = {}
  for (const key of MEMBERS) {
    if (overrides[key] !== undefined) members[key] = overrides[key] as ReturnType<typeof vi.fn>
    // A member the caller overrode with `undefined` is one this composition does not wire.
    if (overrides[key] !== undefined || !(key in overrides)) wired[key] = members[key]
  }
  const onClose = vi.fn()
  const view = render(<PreviewCard {...{ t, preview, onClose, ...wired } as unknown as ComponentProps<typeof PreviewCard>} />)
  return { ...members, onClose, view }
}

const editor = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: '编辑文件内容' }) as HTMLTextAreaElement
const saveButton = (): HTMLButtonElement => screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
const ctrlS = (target: HTMLElement): void => { fireEvent.keyDown(target, { key: 's', ctrlKey: true }) }

afterEach(cleanup)

describe('PreviewCard editor', () => {
  it('opens the file as a line-numbered editor without a mode toggle', async () => {
    const injected = card()
    expect(await screen.findByRole('textbox', { name: '编辑文件内容' })).toBeTruthy()
    expect(injected.loadForEdit).toHaveBeenCalledWith(PATH)
    expect(editor().value).toBe(CONTENT)
    // The trailing newline is a real (empty) second line, numbered like any other.
    const rows = [...document.querySelectorAll('[data-line]')]
    expect(rows.map(row => row.textContent)).toEqual(['1', '2'])
    expect(rows[0]!.closest('[aria-hidden="true"]')).not.toBeNull()
    // Always editable: no control switches the card into (or out of) an edit mode.
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
    expect(saveButton().disabled).toBe(true)
  })

  it('lands the caret in the buffer as soon as it opens, and takes none without a write face', async () => {
    card()
    expect(await screen.findByRole('textbox', { name: '编辑文件内容' })).toBeTruthy()
    expect(document.activeElement).toBe(editor())
    cleanup()
    card({ loadForEdit: undefined, saveEdit: undefined, reloadPreview: undefined })
    expect(editor().readOnly).toBe(true)
    expect(document.activeElement).not.toBe(editor())
  })

  it('saves the edited buffer with Ctrl+S and keeps the next save guarded by the new version', async () => {
    const injected = card()
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    fireEvent.change(editor(), { target: { value: 'export const x = 1\n' } })
    expect(saveButton().disabled).toBe(false)
    ctrlS(editor())
    await waitFor(() => { expect(injected.saveEdit).toHaveBeenCalledWith(PATH, 'export const x = 1\n', 'v1') })
    await waitFor(() => { expect(injected.reloadPreview).toHaveBeenCalledWith(PATH) })
    // The written version is the next guard, and a saved buffer is clean again.
    await waitFor(() => { expect(saveButton().disabled).toBe(true) })
    fireEvent.change(editor(), { target: { value: 'export const y = 2\n' } })
    ctrlS(editor())
    await waitFor(() => { expect(injected.saveEdit).toHaveBeenLastCalledWith(PATH, 'export const y = 2\n', 'v2') })
  })

  it('saves from the Save control and from the platform modifier', async () => {
    const injected = card()
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    fireEvent.change(editor(), { target: { value: 'mine' } })
    fireEvent.click(saveButton())
    await waitFor(() => { expect(injected.saveEdit).toHaveBeenCalledWith(PATH, 'mine', 'v1') })
    fireEvent.change(editor(), { target: { value: 'mine again' } })
    fireEvent.keyDown(editor(), { key: 's', metaKey: true })
    await waitFor(() => { expect(injected.saveEdit).toHaveBeenLastCalledWith(PATH, 'mine again', 'v2') })
  })

  it('saves nothing for a clean buffer or a modified key that is not Ctrl+S', async () => {
    const injected = card()
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    // Clean: the control is disabled and the shortcut writes nothing.
    ctrlS(editor())
    fireEvent.keyDown(editor(), { key: 's' })
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(editor(), { key: 'e', ctrlKey: true })
    expect(injected.saveEdit).not.toHaveBeenCalled()
    // A dirty buffer still ignores an unrelated chord.
    fireEvent.change(editor(), { target: { value: 'mine' } })
    fireEvent.keyDown(editor(), { key: 'e', ctrlKey: true })
    expect(injected.saveEdit).not.toHaveBeenCalled()
  })

  it('reports the write in flight and ignores a second shortcut until it settles', async () => {
    let release: ((result: { ok: true; version: string }) => void) | undefined
    const injected = card({ saveEdit: vi.fn(() => new Promise<{ ok: true; version: string }>((resolve) => { release = resolve })) })
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    fireEvent.change(editor(), { target: { value: 'mine' } })
    ctrlS(editor())
    expect(saveButton().textContent).toBe('保存中…')
    expect(saveButton().disabled).toBe(true)
    // The write in flight is not restarted by another press.
    ctrlS(editor())
    expect(injected.saveEdit).toHaveBeenCalledOnce()
    release?.({ ok: true, version: 'v2' })
    await waitFor(() => { expect(saveButton().disabled).toBe(true) })
  })

  it('keeps the edited buffer and offers a reload when the file changed underneath', async () => {
    const loadForEdit = vi.fn()
      .mockResolvedValueOnce({ text: CONTENT, version: 'v1' })
      .mockResolvedValueOnce({ text: 'theirs\n', version: 'v2' })
    const injected = card({ loadForEdit, saveEdit: vi.fn(async () => ({ ok: false, conflict: true })) })
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    fireEvent.change(editor(), { target: { value: 'mine' } })
    ctrlS(editor())
    expect(await screen.findByText('文件已被其他改动覆盖，请重新加载后再编辑。')).toBeTruthy()
    // The buffer survives the refusal, so the edit is not lost to a reload.
    expect(editor().value).toBe('mine')
    expect(injected.reloadPreview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await waitFor(() => { expect(editor().value).toBe('theirs\n') })
    expect(loadForEdit).toHaveBeenCalledTimes(2)
  })

  it('reports a refused write and a rejected write, keeping the buffer either way', async () => {
    const refused = card({ saveEdit: vi.fn(async () => ({ ok: false, conflict: false })) })
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    fireEvent.change(editor(), { target: { value: 'mine' } })
    ctrlS(editor())
    expect(await screen.findByText('保存失败，请重试。')).toBeTruthy()
    expect(editor().value).toBe('mine')
    expect(refused.reloadPreview).not.toHaveBeenCalled()
    cleanup()
    const rejected = card({ saveEdit: vi.fn(async () => { throw new Error('gateway down') }) })
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    fireEvent.change(editor(), { target: { value: 'mine' } })
    ctrlS(editor())
    expect(await screen.findByText('保存失败，请重试。')).toBeTruthy()
    expect(editor().value).toBe('mine')
    expect(rejected.reloadPreview).not.toHaveBeenCalled()
  })

  it('reports a failed buffer read and retries from the same banner action', async () => {
    const loadForEdit = vi.fn()
      .mockRejectedValueOnce(new Error('too large'))
      .mockResolvedValueOnce({ text: CONTENT, version: 'v1' })
    const injected = card({ loadForEdit })
    expect(await screen.findByText('无法读取编辑内容，请重试。')).toBeTruthy()
    // An empty buffer over a file the Host refused would invite a save that erases it.
    expect(screen.queryByRole('textbox', { name: '编辑文件内容' })).toBeNull()
    expect(injected.saveEdit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await waitFor(() => { expect(editor().value).toBe(CONTENT) })
    expect(loadForEdit).toHaveBeenCalledTimes(2)
  })

  it('shows the read in flight before the buffer arrives', async () => {
    let release: ((buffer: { text: string; version: string }) => void) | undefined
    card({ loadForEdit: vi.fn(() => new Promise<{ text: string; version: string }>((resolve) => { release = resolve })) })
    expect(screen.getByText('正在读取文件…')).toBeTruthy()
    release?.({ text: CONTENT, version: 'v1' })
    expect(await screen.findByRole('textbox', { name: '编辑文件内容' })).toBeTruthy()
  })

  it('opens a read-only buffer seeded from the read it already has when no edit face is wired', () => {
    card({ loadForEdit: undefined, saveEdit: undefined, reloadPreview: undefined })
    expect(editor().value).toBe(CONTENT)
    expect(editor().readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    // The shortcut is inert without a write face, so the card cannot pretend to save.
    ctrlS(editor())
  })

  it('suppresses the browser context menu on the card', () => {
    card()
    const cardElement = document.querySelector('[data-kind="code"]')!
    // fireEvent returns false when the default was prevented.
    expect(fireEvent.contextMenu(cardElement)).toBe(false)
  })

  it('reads the new path when another file replaces the preview', async () => {
    const injected = card({ loadForEdit: vi.fn(async (path: string) => ({ text: path === PATH ? CONTENT : 'other\n', version: 'v1' })) })
    await screen.findByRole('textbox', { name: '编辑文件内容' })
    const other: StudioPreview = { path: '/workspace/other.ts', status: 'ready', content: 'other\n', kind: 'code' }
    injected.view.rerender(<PreviewCard {...{
      t,
      preview: other,
      onClose: injected.onClose,
      insertReference: injected.insertReference,
      loadForEdit: injected.loadForEdit,
      saveEdit: injected.saveEdit,
      reloadPreview: injected.reloadPreview,
    } as unknown as ComponentProps<typeof PreviewCard>} />)
    await waitFor(() => { expect(editor().value).toBe('other\n') })
    expect(injected.loadForEdit).toHaveBeenLastCalledWith('/workspace/other.ts')
    // The new buffer takes the caret again, exactly as opening the card did.
    expect(document.activeElement).toBe(editor())
  })

  it('drops a read that settles or fails after the card moved on', async () => {
    let release: ((buffer: { text: string; version: string }) => void) | undefined
    const settled = render(<PreviewCard {...{
      t,
      preview: codePreview,
      onClose: vi.fn(),
      insertReference: vi.fn(),
      loadForEdit: vi.fn(() => new Promise<{ text: string; version: string }>((resolve) => { release = resolve })),
      saveEdit: vi.fn(),
      reloadPreview: vi.fn(),
    } as unknown as ComponentProps<typeof PreviewCard>} />)
    settled.unmount()
    // The settlement of an unmounted read writes nothing (and throws nothing).
    release?.({ text: 'late', version: 'v9' })
    await Promise.resolve()
    expect(document.querySelector('[data-line]')).toBeNull()
    let reject: ((error: Error) => void) | undefined
    const failed = render(<PreviewCard {...{
      t,
      preview: codePreview,
      onClose: vi.fn(),
      insertReference: vi.fn(),
      loadForEdit: vi.fn(() => new Promise<{ text: string; version: string }>((_resolve, deny) => { reject = deny })),
      saveEdit: vi.fn(),
      reloadPreview: vi.fn(),
    } as unknown as ComponentProps<typeof PreviewCard>} />)
    failed.unmount()
    // A refusal that arrives after the card moved on reports nothing either.
    reject?.(new Error('gone'))
    await Promise.resolve()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('scrolls a search jump near its hit line, computed from the fixed row height', async () => {
    const focused: StudioPreview = { path: PATH, status: 'ready', content: 'a\nb\nc\n', kind: 'code', focus: { line: 3, column: 1 } }
    const { view } = card({ loadForEdit: vi.fn(async () => ({ text: 'a\nb\nc\n', version: 'v1' })) }, focused)
    await waitFor(() => { expect(editor().value).toBe('a\nb\nc\n') })
    // Rows never wrap, so the offset is line arithmetic rather than measurement.
    expect(view.container.querySelector('textarea')!.parentElement!.scrollTop).toBe(55)
    expect(document.querySelector('[data-line="3"]')!.getAttribute('data-focus')).toBe('true')
  })
})
