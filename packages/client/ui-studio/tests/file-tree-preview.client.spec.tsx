// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FileTree } from '../src/client/left-panel/FileTree.tsx'
import { PreviewCard } from '../src/client/preview/PreviewCard.tsx'
import { WorkBase } from '../src/client/left-panel/WorkBase.tsx'
import { zh } from '../src/client/left-panel/locales.ts'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'

const t = makeTranslate(zh) as never
const listing: DirectoryListing = { path: '/workspace', home: '/workspace', crumbs: [], truncated: false, entries: [{ kind: 'file', name: 'main.ts', path: '/workspace/main.ts', hidden: false }] }

afterEach(cleanup)

describe('FileTree', () => {
  it('reports a localized failure when the native picker is unavailable', async () => {
    const useWorkspaces = (selector: (state: {
      items: never[]
      archivedSessionIds: never[]
    }) => unknown): unknown => selector({ items: [], archivedSessionIds: [] })
    render(<WorkBase
      t={t}
      useSessions={() => ({ ids: [], byId: {}, current: undefined }) as never}
      useWorkspaces={useWorkspaces as never}
      startSession={vi.fn()}
      open={vi.fn()}
      archiveSession={vi.fn()}
      renameSession={vi.fn()}
      renameWorkspace={vi.fn()}
      deleteWorkspace={vi.fn()}
      forkSession={vi.fn()}
      createWorkspace={vi.fn()}
      renderSlot={(_name, owner) => {
        if (owner.open) owner.onError('无法添加工作区，请重试。')
        return null
      }}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))
    expect(await screen.findByText('无法添加工作区，请重试。')).toBeTruthy()
  })

  it('publishes the loading preview immediately and keeps the tree interactive', async () => {
    const onPreview = vi.fn()
    let release: ((content: { path: string; content: string; language?: string }) => void) | undefined
    render(<FileTree t={t} rootPath="/workspace" listDirectory={vi.fn(async () => listing)} readFile={vi.fn(() => new Promise((resolve) => { release = resolve }))} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    const file = await screen.findByRole('button', { name: 'main.ts' })
    fireEvent.click(file)
    expect(onPreview).toHaveBeenCalledWith({ path: '/workspace/main.ts', status: 'loading', kind: 'code' })
    // The read settles later; the tree itself never shows a reading placeholder.
    release?.({ path: '/workspace/main.ts', content: 'export {}', language: 'typescript' })
    await vi.waitFor(() => { expect(onPreview).toHaveBeenCalledWith({ path: '/workspace/main.ts', status: 'ready', content: 'export {}', language: 'typescript', kind: 'code' }) })
    expect(screen.getByRole('button', { name: 'main.ts' })).toBeTruthy()
    expect(screen.queryByText('正在读取文件…')).toBeNull()
  })

  it('renders the selected file as a floating card over the conversation column', () => {
    const onClose = vi.fn()
    render(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'ready', content: 'export {}', language: 'typescript', kind: 'code' }, onClose } as never} />)
    expect(screen.getByRole('region', { name: '代码预览' })).toBeTruthy()
    expect(screen.getByText('/workspace/main.ts')).toBeTruthy()
    expect(screen.getByText('export {}')).toBeTruthy()
    expect(screen.getByText('typescript')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭预览' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('opens rendered artifacts such as HTML in an embedded iframe card', async () => {
    const onPreview = vi.fn()
    const htmlListing: DirectoryListing = {
      path: '/workspace', home: '/workspace', crumbs: [], truncated: false,
      entries: [{ kind: 'file', name: 'index.html', path: '/workspace/index.html', hidden: false }],
    }
    render(<FileTree t={t} rootPath="/workspace" listDirectory={vi.fn(async () => htmlListing)} readFile={vi.fn(async () => ({ path: '/workspace/index.html', content: '<h1>hi</h1>', language: 'html' }))} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'index.html' }))
    expect(onPreview).toHaveBeenCalledWith({ path: '/workspace/index.html', status: 'loading', kind: 'iframe' })
    await vi.waitFor(() => { expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/index.html', status: 'ready', content: '<h1>hi</h1>', language: 'html', kind: 'iframe' }) })
    // The card presents an iframe embedding the source instead of raw code.
    const onClose = vi.fn()
    render(<PreviewCard {...{ t, preview: { path: '/workspace/index.html', status: 'ready', content: '<h1>hi</h1>', language: 'html', kind: 'iframe' }, onClose } as never} />)
    expect(screen.getByRole('region', { name: 'HTML 预览' })).toBeTruthy()
    const frame = screen.getByTitle('/workspace/index.html')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('srcdoc')).toBe('<h1>hi</h1>')
    // Scripts run in an opaque origin: produced HTML is embedded without access
    // to the app origin, so allow-same-origin must stay off.
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  it('still lists non-rendered code files as code previews', async () => {
    const onPreview = vi.fn()
    render(<FileTree t={t} rootPath="/workspace" listDirectory={vi.fn(async () => listing)} readFile={vi.fn(async () => ({ path: '/workspace/main.ts', content: 'export {}' }))} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'main.ts' }))
    await vi.waitFor(() => { expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/main.ts', status: 'ready', content: 'export {}', kind: 'code' }) })
  })

  it('shows the read failure inside the floating card while the tree stays', async () => {
    const onPreview = vi.fn()
    render(<FileTree t={t} rootPath="/workspace" listDirectory={vi.fn(async () => listing)} readFile={vi.fn(async () => { throw new Error('denied') })} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'main.ts' }))
    expect(await screen.findByRole('button', { name: 'main.ts' })).toBeTruthy()
    expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/main.ts', status: 'error', kind: 'code' })
  })

  it('carries the reading and failure states inside the floating card', () => {
    const onClose = vi.fn()
    const view = render(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'loading', kind: 'code' }, onClose } as never} />)
    expect(view.getByText('正在读取文件…')).toBeTruthy()
    view.rerender(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'error', kind: 'code' }, onClose } as never} />)
    expect(view.getByText('无法读取此文件')).toBeTruthy()
    view.rerender(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'ready', content: 'export {}', kind: 'code' }, onClose } as never} />)
    expect(view.getByText('纯文本')).toBeTruthy()
  })

  it('reports folder toggles to the workspace store and renders expanded children', async () => {
    const root: DirectoryListing = {
      path: '/workspace', home: '/workspace', crumbs: [], truncated: false,
      entries: [{ kind: 'directory', name: 'src', path: '/workspace/src', hidden: false }],
    }
    const src: DirectoryListing = {
      path: '/workspace/src', home: '/workspace', crumbs: [], truncated: false,
      entries: [{ kind: 'file', name: 'deep.ts', path: '/workspace/src/deep.ts', hidden: false }],
    }
    const listDirectory = vi.fn(async (path?: string) => path === '/workspace/src' ? src : root)
    const onToggleExpanded = vi.fn()
    const view = render(<FileTree t={t} rootPath="/workspace" listDirectory={listDirectory} readFile={vi.fn()} onPreview={vi.fn()} expandedPaths={[]} onToggleExpanded={onToggleExpanded} />)
    const folder = await screen.findByRole('button', { name: 'src' })
    expect(folder.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(folder)
    expect(onToggleExpanded).toHaveBeenCalledWith('/workspace/src')
    // Store-driven: re-render with the path expanded, children load and show.
    view.rerender(<FileTree t={t} rootPath="/workspace" listDirectory={listDirectory} readFile={vi.fn()} onPreview={vi.fn()} expandedPaths={['/workspace/src']} onToggleExpanded={onToggleExpanded} />)
    expect(await screen.findByRole('button', { name: 'deep.ts' })).toBeTruthy()
    expect((await screen.findByRole('button', { name: 'src' })).getAttribute('aria-expanded')).toBe('true')
  })

  it('tints the row of the file that is open in the preview card', async () => {
    const openListing: DirectoryListing = {
      path: '/workspace', home: '/workspace', crumbs: [], truncated: false,
      entries: [
        { kind: 'file', name: 'main.ts', path: '/workspace/main.ts', hidden: false },
        { kind: 'file', name: 'other.ts', path: '/workspace/other.ts', hidden: false },
      ],
    }
    const view = render(<FileTree t={t} rootPath="/workspace" listDirectory={vi.fn(async () => openListing)} readFile={vi.fn()} onPreview={vi.fn()} expandedPaths={[]} onToggleExpanded={vi.fn()} openPath="/workspace/main.ts" />)
    expect((await view.findByRole('button', { name: 'main.ts' })).getAttribute('data-open')).toBe('true')
    expect(view.getByRole('button', { name: 'other.ts' }).getAttribute('data-open')).toBeNull()
  })
})
