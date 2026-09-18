// @vitest-environment jsdom
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// components' props resolve against; load it type-only so the aggregate client
// tests project sees the same props as the package program.
import type {} from '../src/client/index.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PreviewCard, type MediaLoadResult } from '../src/client/preview/PreviewCard.tsx'
import type { StudioPreview } from '../src/client/frame/contract.ts'
import { zh } from '../src/client/left-panel/locales.ts'

const t = makeTranslate(zh) as never

type CardProps = ComponentProps<typeof PreviewCard>

/** One media read's bytes, compared by the assertions only through the blob they fill. */
const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:studio-media')
const revokeObjectURL = vi.fn<(url: string) => void>()
// jsdom implements no blob URL registry, so these specs install one and put the
// absent originals back afterwards.
const savedCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const savedRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  if (savedCreate === undefined) Reflect.deleteProperty(URL, 'createObjectURL')
  else Object.defineProperty(URL, 'createObjectURL', savedCreate)
  if (savedRevoke === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL')
  else Object.defineProperty(URL, 'revokeObjectURL', savedRevoke)
  createObjectURL.mockReset()
  createObjectURL.mockReturnValue('blob:studio-media')
  revokeObjectURL.mockReset()
})

/** Render the card over one preview state and the injected faces under test. */
function show(preview: StudioPreview, injected: Partial<CardProps> = {}) {
  return render(<PreviewCard {...{ t, onClose: vi.fn(), preview, ...injected } as unknown as CardProps} />)
}

describe('PreviewCard media surface', () => {
  it('renders an image from the blob URL its own read produced', async () => {
    const loadMedia = vi.fn(async () => ({ ok: true as const, data: bytes('png') }))
    show({ path: '/workspace/assets/logo.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, { loadMedia })

    const image = await screen.findByRole('img', { name: '图片预览：logo.png' })
    expect(image.getAttribute('src')).toBe('blob:studio-media')
    expect(loadMedia).toHaveBeenCalledWith('/workspace/assets/logo.png')
    // The blob carries the type the producer's extension table assigned, which is
    // what the browser decodes the bytes as.
    expect(createObjectURL.mock.calls[0]![0].type).toBe('image/png')
    expect(screen.getByRole('region', { name: '图片预览' })).toBeTruthy()
    // No text read ever backs a media card, so no editor or line grid appears.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders a video with playback controls from its blob URL', async () => {
    const loadMedia = vi.fn(async () => ({ ok: true as const, data: bytes('mp4') }))
    const view = show({ path: '/workspace/clips/take.mp4', status: 'ready', kind: 'video', mediaType: 'video/mp4' }, { loadMedia })

    await waitFor(() => { expect(createObjectURL).toHaveBeenCalled() })
    const video = view.container.querySelector('video')
    expect(video?.getAttribute('src')).toBe('blob:studio-media')
    expect(video?.hasAttribute('controls')).toBe(true)
    expect(video?.getAttribute('aria-label')).toBe('视频预览')
    expect(screen.getByRole('region', { name: '视频预览' })).toBeTruthy()
  })

  it('shows the reading status while the card\'s own read is in flight', () => {
    show({ path: '/workspace/photo.webp', status: 'ready', kind: 'image', mediaType: 'image/webp' }, {
      loadMedia: vi.fn(() => new Promise<MediaLoadResult>(() => {})),
    })
    expect(screen.getByText('正在读取文件…')).toBeTruthy()
    // Nothing has failed yet, so the status is not an alert.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports the Host complete-file cap and retries the read on request', async () => {
    const loadMedia = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, reason: 'too-large' as const })
      .mockResolvedValueOnce({ ok: true as const, data: bytes('png') })
    show({ path: '/workspace/huge.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, { loadMedia })

    expect((await screen.findByRole('alert')).textContent).toBe('文件过大，无法预览')
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await waitFor(() => { expect(loadMedia).toHaveBeenCalledTimes(2) })
    expect(await screen.findByRole('img', { name: '图片预览：huge.png' })).toBeTruthy()
  })

  it('reports a refused read as unavailable', async () => {
    show({ path: '/workspace/photo.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, {
      loadMedia: vi.fn(async () => { throw new Error('denied') }),
    })
    expect((await screen.findByRole('alert')).textContent).toBe('无法读取此媒体文件')
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
  })

  it('reports an unavailable file when no media face is wired', async () => {
    show({ path: '/workspace/photo.png', status: 'ready', kind: 'image', mediaType: 'image/png' })
    expect((await screen.findByRole('alert')).textContent).toBe('无法读取此媒体文件')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('reports an unavailable file when the browser mints no blob URL', async () => {
    createObjectURL.mockImplementation(() => { throw new Error('no blob URL') })
    show({ path: '/workspace/photo.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, {
      loadMedia: vi.fn(async () => ({ ok: true as const, data: bytes('png') })),
    })
    expect((await screen.findByRole('alert')).textContent).toBe('无法读取此媒体文件')
    // Nothing was minted, so there is nothing to revoke.
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('reports a media element that cannot decode the bytes it was handed', async () => {
    show({ path: '/workspace/broken.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, {
      loadMedia: vi.fn(async () => ({ ok: true as const, data: bytes('not really a png') })),
    })
    fireEvent.error(await screen.findByRole('img', { name: '图片预览：broken.png' }))
    expect((await screen.findByRole('alert')).textContent).toBe('无法读取此媒体文件')
  })

  it('shows the media failure for a path that never resolved, without reading it', async () => {
    const loadMedia = vi.fn()
    show({ path: 'assets/logo.png', status: 'error', kind: 'image' }, { loadMedia })
    expect((await screen.findByRole('alert')).textContent).toBe('无法读取此媒体文件')
    expect(loadMedia).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
    // A path that failed to resolve is not a read worth offering again.
    expect(screen.queryByRole('button', { name: '重新加载' })).toBeNull()
  })

  it('revokes each blob URL when the card moves to another file and when it unmounts', async () => {
    let minted = 0
    createObjectURL.mockImplementation(() => `blob:media-${++minted}`)
    const loadMedia = vi.fn(async () => ({ ok: true as const, data: bytes('png') }))
    const view = show({ path: '/workspace/one.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, { loadMedia })
    await screen.findByRole('img', { name: '图片预览：one.png' })

    // A new publication is a new media state, so the URL the first one produced
    // is revoked as the card reads the second file.
    view.rerender(<PreviewCard {...{
      t,
      onClose: vi.fn(),
      preview: { path: '/workspace/two.png', status: 'ready', kind: 'image', mediaType: 'image/png' },
      loadMedia,
    } as unknown as CardProps} />)
    await waitFor(() => { expect(revokeObjectURL).toHaveBeenCalledWith('blob:media-1') })
    expect((await screen.findByRole('img', { name: '图片预览：two.png' })).getAttribute('src')).toBe('blob:media-2')

    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:media-2')
  })

  it('creates no blob URL for a read that settles after the card unmounts', async () => {
    let release: ((result: MediaLoadResult) => void) | undefined
    const loadMedia = vi.fn(() => new Promise<MediaLoadResult>((resolve) => { release = resolve }))
    const view = show({ path: '/workspace/photo.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, { loadMedia })
    view.unmount()

    release?.({ ok: true, data: bytes('png') })
    await Promise.resolve()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('ignores a refusal from a read the card has already moved on from', async () => {
    const refused: ((reason: unknown) => void)[] = []
    const loadMedia = vi.fn((path: string) => path === '/workspace/one.png'
      ? new Promise<MediaLoadResult>((_resolve, rejectPromise) => { refused.push(rejectPromise) })
      : Promise.resolve({ ok: true as const, data: bytes('png') }))
    const view = show({ path: '/workspace/one.png', status: 'ready', kind: 'image', mediaType: 'image/png' }, { loadMedia })
    view.rerender(<PreviewCard {...{
      t,
      onClose: vi.fn(),
      preview: { path: '/workspace/two.png', status: 'ready', kind: 'image', mediaType: 'image/png' },
      loadMedia,
    } as unknown as CardProps} />)
    await screen.findByRole('img', { name: '图片预览：two.png' })

    refused[0]?.(new Error('denied'))
    await Promise.resolve()
    // The refusal belongs to a file the card is no longer showing.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('img', { name: '图片预览：two.png' })).toBeTruthy()
  })

  it('names a refused binary format instead of showing it as source', () => {
    show({ path: '/workspace/docs/report.pdf', status: 'error', kind: 'binary' })
    expect(screen.getByRole('region', { name: '二进制文件预览' })).toBeTruthy()
    expect(screen.getByText('此二进制文件暂不支持预览')).toBeTruthy()
    // The refusal comes from the path, not from a read, so no retry is offered.
    expect(screen.queryByRole('button', { name: '重新加载' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
