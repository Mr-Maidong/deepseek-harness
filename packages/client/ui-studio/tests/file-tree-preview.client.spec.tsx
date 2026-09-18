// @vitest-environment jsdom
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// components' props resolve against; load it type-only so the aggregate client
// tests project sees the same props as the package program.
import type {} from '../src/client/index.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FileTree } from '../src/client/left-panel/FileTree.tsx'
import { PreviewCard } from '../src/client/preview/PreviewCard.tsx'
import { zh } from '../src/client/left-panel/locales.ts'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'

const t = makeTranslate(zh) as never
// The framework global seat the components ignore but the composed props
// require; the render sites spread it and pass only the props under test.
const globalStandardProps = {
  useSessions: () => undefined,
  useWorkspaces: () => undefined,
  useSessionPendingInteraction: () => undefined,
} as unknown as ComponentProps<typeof FileTree>
const listing: DirectoryListing = { path: '/workspace', home: '/workspace', crumbs: [], truncated: false, entries: [{ kind: 'file', name: 'main.ts', path: '/workspace/main.ts', hidden: false }] }

afterEach(cleanup)

describe('FileTree', () => {
  it('publishes the loading preview immediately and keeps the tree interactive', async () => {
    const onPreview = vi.fn()
    let release: ((content: { path: string; content: string; language?: string }) => void) | undefined
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => listing)} readFile={vi.fn(() => new Promise<{ path: string; content: string; language?: string }>((resolve) => { release = resolve }))} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
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
    render(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'ready', content: 'export {}', language: 'typescript', kind: 'code' }, onClose } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(screen.getByRole('region', { name: '代码预览' })).toBeTruthy()
    expect(screen.getByText('/workspace/main.ts')).toBeTruthy()
    // Without an edit face the card opens the read it already has as a read-only buffer.
    expect((screen.getByRole('textbox', { name: '编辑文件内容' }) as HTMLTextAreaElement).value).toBe('export {}')
    expect((screen.getByRole('textbox', { name: '编辑文件内容' }) as HTMLTextAreaElement).readOnly).toBe(true)
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
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => htmlListing)} readFile={vi.fn(async () => ({ path: '/workspace/index.html', content: '<h1>hi</h1>', language: 'html' }))} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'index.html' }))
    expect(onPreview).toHaveBeenCalledWith({ path: '/workspace/index.html', status: 'loading', kind: 'iframe' })
    await vi.waitFor(() => { expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/index.html', status: 'ready', content: '<h1>hi</h1>', kind: 'iframe' }) })
    // The card presents an iframe embedding the source instead of raw code.
    const onClose = vi.fn()
    render(<PreviewCard {...{ t, preview: { path: '/workspace/index.html', status: 'ready', content: '<h1>hi</h1>', language: 'html', kind: 'iframe' }, onClose } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(screen.getByRole('region', { name: 'HTML 预览' })).toBeTruthy()
    const frame = screen.getByTitle('/workspace/index.html')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('srcdoc')).toBe('<h1>hi</h1>')
    // Scripts run in an opaque origin: produced HTML is embedded without access
    // to the app origin, so allow-same-origin must stay off.
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  it('opens a rendered artifact whose read fails as an iframe error', async () => {
    const onPreview = vi.fn()
    const htmlListing: DirectoryListing = {
      path: '/workspace', home: '/workspace', crumbs: [], truncated: false,
      entries: [{ kind: 'file', name: 'index.html', path: '/workspace/index.html', hidden: false }],
    }
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => htmlListing)} readFile={vi.fn(async () => { throw new Error('denied') })} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'index.html' }))
    await vi.waitFor(() => { expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/index.html', status: 'error', kind: 'iframe' }) })
  })

  it('still lists non-rendered code files as code previews', async () => {
    const onPreview = vi.fn()
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => listing)} readFile={vi.fn(async () => ({ path: '/workspace/main.ts', content: 'export {}' }))} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'main.ts' }))
    await vi.waitFor(() => { expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/main.ts', status: 'ready', content: 'export {}', kind: 'code' }) })
  })

  it('shows the read failure inside the floating card while the tree stays', async () => {
    const onPreview = vi.fn()
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => listing)} readFile={vi.fn(async () => { throw new Error('denied') })} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'main.ts' }))
    expect(await screen.findByRole('button', { name: 'main.ts' })).toBeTruthy()
    expect(onPreview).toHaveBeenLastCalledWith({ path: '/workspace/main.ts', status: 'error', kind: 'code' })
  })

  it('opens a media file without the tree reading any text', async () => {
    const onPreview = vi.fn()
    const readFile = vi.fn()
    const mediaListing: DirectoryListing = {
      path: '/workspace', home: '/workspace', crumbs: [], truncated: false,
      entries: [{ kind: 'file', name: 'logo.png', path: '/workspace/logo.png', hidden: false }],
    }
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => mediaListing)} readFile={readFile} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'logo.png' }))
    // The card reads media bytes itself, so one publication carries the path and
    // the type, and the bounded text read never runs.
    expect(readFile).not.toHaveBeenCalled()
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith({ path: '/workspace/logo.png', status: 'ready', kind: 'image', mediaType: 'image/png' })
  })

  it('refuses a binary format rather than opening it as source', async () => {
    const onPreview = vi.fn()
    const readFile = vi.fn()
    const binaryListing: DirectoryListing = {
      path: '/workspace', home: '/workspace', crumbs: [], truncated: false,
      entries: [{ kind: 'file', name: 'report.pdf', path: '/workspace/report.pdf', hidden: false }],
    }
    render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => binaryListing)} readFile={readFile} onPreview={onPreview} expandedPaths={[]} onToggleExpanded={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'report.pdf' }))
    expect(readFile).not.toHaveBeenCalled()
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith({ path: '/workspace/report.pdf', status: 'error', kind: 'binary' })
  })

  it('reveals an insert-reference bubble over a buffer selection and quotes file + line range', () => {
    const onClose = vi.fn()
    const insertReference = vi.fn()
    const content = 'line1\nline2\nline3\nline4'
    const { container } = render(<PreviewCard {...{ t, preview: { path: '/workspace/src/main.ts', status: 'ready', content, kind: 'code' }, onClose, insertReference } as unknown as ComponentProps<typeof PreviewCard>} />)
    const editor = container.querySelector('textarea')!
    // A selection spanning line 2 through line 3 quotes both; the editor never wraps,
    // so character offsets map straight to source lines.
    editor.setSelectionRange('line1\n'.length, 'line1\nline2\nline3'.length)
    fireEvent.mouseUp(editor)
    const bubble = screen.getByRole('button', { name: '引入' })
    expect(bubble).toBeTruthy()
    fireEvent.click(bubble)
    expect(insertReference).toHaveBeenCalledWith({ path: '/workspace/src/main.ts', startLine: 2, endLine: 3 })
    expect(screen.queryByRole('button', { name: '引入' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '关闭预览' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('carries the reading and failure states inside the floating card', () => {
    const onClose = vi.fn()
    const view = render(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'loading', kind: 'code' }, onClose } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(view.getByText('正在读取文件…')).toBeTruthy()
    view.rerender(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'error', kind: 'code' }, onClose } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(view.getByText('无法读取此文件')).toBeTruthy()
    view.rerender(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'ready', content: 'export {}', kind: 'code' }, onClose } as unknown as ComponentProps<typeof PreviewCard>} />)
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
    const view = render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={listDirectory} readFile={vi.fn()} onPreview={vi.fn()} expandedPaths={[]} onToggleExpanded={onToggleExpanded} />)
    const folder = await screen.findByRole('button', { name: 'src' })
    expect(folder.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(folder)
    expect(onToggleExpanded).toHaveBeenCalledWith('/workspace/src')
    // Store-driven: re-render with the path expanded, children load and show.
    view.rerender(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={listDirectory} readFile={vi.fn()} onPreview={vi.fn()} expandedPaths={['/workspace/src']} onToggleExpanded={onToggleExpanded} />)
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
    const view = render(<FileTree {...globalStandardProps} t={t} activeSection="project" rootPath="/workspace" listDirectory={vi.fn(async () => openListing)} readFile={vi.fn()} onPreview={vi.fn()} expandedPaths={[]} onToggleExpanded={vi.fn()} openPath="/workspace/main.ts" />)
    expect((await view.findByRole('button', { name: 'main.ts' })).getAttribute('data-open')).toBe('true')
    expect(view.getByRole('button', { name: 'other.ts' }).getAttribute('data-open')).toBeNull()
  })
})

describe('PreviewCard line numbers', () => {
  const cardProps = (content: string, extra: Record<string, unknown> = {}): ComponentProps<typeof PreviewCard> =>
    ({ t, preview: { path: '/workspace/src/main.ts', status: 'ready', kind: 'code', content, ...extra }, onClose: vi.fn() } as unknown as ComponentProps<typeof PreviewCard>)

  /** Select `from`..`to` inside the editor buffer. The editor never wraps, so offsets map to lines. */
  const selectRange = (container: HTMLElement, from: number, to: number): void => {
    container.querySelector('textarea')!.setSelectionRange(from, to)
  }

  it('numbers every source line in a gutter that stays out of the buffer', () => {
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta\ngamma')} />)
    const rows = [...container.querySelectorAll('[data-line]')]
    expect(rows.map(row => row.textContent)).toEqual(['1', '2', '3'])
    // Numbers are presentational: the buffer still holds exactly the file.
    expect(container.querySelector('textarea')!.value).toBe('alpha\nbeta\ngamma')
    expect(rows[0]!.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('numbers no preview that carries no source lines', () => {
    const view = render(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'loading', kind: 'code' }, onClose: vi.fn() } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(view.container.querySelector('[data-line]')).toBeNull()
    // A rendered artifact embeds an iframe, so it has no line grid at all.
    view.rerender(<PreviewCard {...{ t, preview: { path: '/workspace/index.html', status: 'ready', kind: 'iframe', content: '<h1>hi</h1>' }, onClose: vi.fn() } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(view.container.querySelector('[data-line]')).toBeNull()
    // Nor does a read that failed.
    view.rerender(<PreviewCard {...{ t, preview: { path: '/workspace/main.ts', status: 'error', kind: 'code' }, onClose: vi.fn() } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(view.container.querySelector('[data-line]')).toBeNull()
  })

  it('marks the line a search jump landed on, clamped to the file', () => {
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta\ngamma', { focus: { line: 2, column: 3 } })} />)
    expect(container.querySelector('[data-line="2"]')!.getAttribute('data-focus')).toBe('true')
    expect(container.querySelector('[data-line="1"]')!.getAttribute('data-focus')).toBeNull()
    // A stale result beyond the file still marks its last readable line.
    const { container: stale } = render(<PreviewCard {...cardProps('alpha\nbeta\ngamma', { focus: { line: 9, column: 1 } })} />)
    expect(stale.querySelector('[data-line="3"]')!.getAttribute('data-focus')).toBe('true')
  })

  it('marks every line number of the selected range', () => {
    const content = 'alpha\nbeta\ngamma'
    const { container } = render(<PreviewCard {...cardProps(content)} />)
    selectRange(container, 'alpha\n'.length, content.length)
    fireEvent.mouseUp(container.querySelector('textarea')!)
    expect(screen.getByRole('button', { name: '引入' })).toBeTruthy()
    expect(container.querySelector('[data-line="2"]')!.getAttribute('data-quoted')).toBe('true')
    expect(container.querySelector('[data-line="3"]')!.getAttribute('data-quoted')).toBe('true')
    expect(container.querySelector('[data-line="1"]')!.getAttribute('data-quoted')).toBeNull()
  })

  it('quotes one line when its gutter number is clicked', () => {
    const insertReference = vi.fn()
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta\ngamma')} insertReference={insertReference} />)
    const row = container.querySelector('[data-line="2"]')!
    fireEvent.click(row)
    expect(row.getAttribute('data-quoted')).toBe('true')
    // The bubble hangs off the clicked line, not any earlier selection.
    fireEvent.click(screen.getByRole('button', { name: '引入' }))
    expect(insertReference).toHaveBeenCalledWith({ path: '/workspace/src/main.ts', startLine: 2, endLine: 2 })
  })

  it('moves the quote to the gutter line that was clicked', () => {
    const content = 'alpha\nbeta\ngamma'
    const { container } = render(<PreviewCard {...cardProps(content)} />)
    selectRange(container, 0, 'alpha'.length)
    fireEvent.mouseUp(container.querySelector('textarea')!)
    expect(container.querySelector('[data-line="1"]')!.getAttribute('data-quoted')).toBe('true')
    fireEvent.click(container.querySelector('[data-line="3"]')!)
    expect(container.querySelector('[data-line="3"]')!.getAttribute('data-quoted')).toBe('true')
    expect(container.querySelector('[data-line="1"]')!.getAttribute('data-quoted')).toBeNull()
  })

  it('keeps a raised bubble when the press moves into the buffer', () => {
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta\ngamma')} />)
    fireEvent.click(container.querySelector('[data-line="2"]')!)
    expect(screen.getByRole('button', { name: '引入' })).toBeTruthy()
    fireEvent.pointerDown(container.querySelector('textarea')!)
    expect(screen.getByRole('button', { name: '引入' })).toBeTruthy()
  })

  it('raises no bubble for a click that selects nothing', () => {
    const content = 'alpha\nbeta\ngamma'
    const { container } = render(<PreviewCard {...cardProps(content)} />)
    // No selection at all: the buffer reports nothing to quote.
    fireEvent.mouseUp(container.querySelector('textarea')!)
    expect(screen.queryByRole('button', { name: '引入' })).toBeNull()
    // A collapsed caret quotes nothing either.
    selectRange(container, 3, 3)
    fireEvent.mouseUp(container.querySelector('textarea')!)
    expect(screen.queryByRole('button', { name: '引入' })).toBeNull()
  })

  it('stops a selection that ends just past a newline at the line it terminates', () => {
    const content = 'alpha\nbeta\ngamma'
    const { container } = render(<PreviewCard {...cardProps(content)} />)
    // Selecting whole lines leaves the caret at the start of line 3, which the
    // quoting rule must not read as a third selected line.
    selectRange(container, 0, 'alpha\nbeta\n'.length)
    fireEvent.mouseUp(container.querySelector('textarea')!)
    expect(container.querySelector('[data-line="1"]')!.getAttribute('data-quoted')).toBe('true')
    expect(container.querySelector('[data-line="2"]')!.getAttribute('data-quoted')).toBe('true')
    expect(container.querySelector('[data-line="3"]')!.getAttribute('data-quoted')).toBeNull()
  })

  it('ignores a press that lands on the gutter but not on a number', () => {
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta')} />)
    // The gutter itself, not one of its numbered cells.
    fireEvent.click(container.querySelector('[data-line="1"]')!.parentElement!)
    expect(screen.queryByRole('button', { name: '引入' })).toBeNull()
  })

  it('drops the bubble when the seat wires no reference callback', () => {
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta')} />)
    fireEvent.click(container.querySelector('[data-line="1"]')!)
    fireEvent.click(screen.getByRole('button', { name: '引入' }))
    expect(screen.queryByRole('button', { name: '引入' })).toBeNull()
  })

  it('quotes the selected range when the selection is made from the keyboard', () => {
    const content = 'alpha\nbeta\ngamma'
    const { container } = render(<PreviewCard {...cardProps(content)} />)
    selectRange(container, 0, 'alpha\nbeta'.length)
    fireEvent.keyUp(container.querySelector('textarea')!)
    expect(container.querySelector('[data-line="1"]')!.getAttribute('data-quoted')).toBe('true')
    expect(container.querySelector('[data-line="2"]')!.getAttribute('data-quoted')).toBe('true')
  })

  it('renders nothing without a preview state', () => {
    const view = render(<PreviewCard {...{ t, preview: undefined, onClose: vi.fn() } as unknown as ComponentProps<typeof PreviewCard>} />)
    expect(view.container.firstChild).toBeNull()
  })

  it('dismisses a raised bubble only for a press outside the surface and the bubble', () => {
    const { container } = render(<PreviewCard {...cardProps('alpha\nbeta')} />)
    const editor = container.querySelector('textarea')!
    fireEvent.click(container.querySelector('[data-line="1"]')!)
    const bubble = () => screen.queryByRole('button', { name: '引入' })
    // A press on the surface, on the bubble itself, or on a target that is not
    // a node keeps the bubble; only an outside node dismisses it.
    fireEvent.pointerDown(editor)
    expect(bubble()).not.toBeNull()
    fireEvent.pointerDown(bubble()!)
    expect(bubble()).not.toBeNull()
    fireEvent.pointerDown(window)
    expect(bubble()).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(bubble()).toBeNull()
  })
})
