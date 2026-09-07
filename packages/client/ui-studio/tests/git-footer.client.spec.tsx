// @vitest-environment jsdom
/**
 * File-tree git footer: the bar below the tree shows the branch and uncommitted
 * totals the Host reports for the root Workspace, reports non-repository workspaces,
 * re-reads on click, and runs its background fill over that read's life cycle.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// component's props resolve against.
import type {} from '../src/client/index.ts'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { GitSummaryResult } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { zh } from '../src/client/left-panel/locales.ts'
import { createFileTreeStore } from '../src/client/left-panel/file-tree-store.ts'
import { LeftPanelMain, type LeftPanelMainProps } from '../src/client/left-panel/LeftPanelMain.tsx'

const t: LeftPanelMainProps['t'] = makeTranslate(zh)

const workspace = { workspaceId: 'ws-1', title: 'Studio', path: '/workspace', sessionIds: [] }

function summaryOf(overrides: Partial<GitSummaryResult>): GitSummaryResult {
  return { branch: 'main', detached: false, insertions: 0, deletions: 0, untrackedFiles: 0, ...overrides }
}

/** Panel props for one root Workspace, driven by the given `gitSummary` verb. */
function propsWith(gitSummary: LeftPanelMainProps['gitSummary']): LeftPanelMainProps {
  const store = createFileTreeStore().create('root')
  return {
    t,
    activeSection: 'project',
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    useSessions: (selector: (state: unknown) => unknown) => selector({ ids: [], byId: {}, current: undefined }),
    useWorkspaces: (selector: (state: unknown) => unknown) => selector({ items: [workspace], archivedSessionIds: [] }),
    gitSummary,
    listDirectory: vi.fn(async () => ({ path: '/workspace', home: '/workspace', crumbs: [], truncated: false, entries: [] })),
    readFile: vi.fn(async () => ({ path: '', content: '' })),
    onPreview: vi.fn(),
    startSession: vi.fn(),
    open: vi.fn(),
    archiveSession: vi.fn(),
    renameSession: vi.fn(),
    renameWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    forkSession: vi.fn(),
    createWorkspace: vi.fn(),
    renderSlot: () => null,
  } as unknown as LeftPanelMainProps
}

/** Render the panel with one root Workspace; `failure` makes the Host read reject. */
function renderPanel(gitSummaryResult: GitSummaryResult | null, failure?: string) {
  const gitSummary = vi.fn(async () => {
    if (failure !== undefined) throw new Error(failure)
    return gitSummaryResult
  })
  render(<LeftPanelMain {...propsWith(gitSummary)} />)
  return gitSummary
}

describe('file-tree git footer', () => {
  afterEach(cleanup)

  it('shows the branch and uncommitted totals of the root workspace', async () => {
    renderPanel(summaryOf({ insertions: 124, deletions: 38 }))
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(footer.textContent).toContain('main')
    expect(footer.textContent).toContain('+124')
    expect(footer.textContent).toContain('−38')
  })

  it('shows untracked file totals alongside line changes', async () => {
    renderPanel(summaryOf({ untrackedFiles: 3 }))
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(footer.textContent).toContain('+3')
  })

  it('is the last row of the file-tree section, below the tree body', async () => {
    renderPanel(summaryOf({ insertions: 2 }))
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    const section = footer.parentElement
    expect(section?.lastElementChild).toBe(footer)
    const treeBody = section?.querySelector('[class*="sectionBody"]')
    expect(treeBody).not.toBeNull()
    expect(footer.compareDocumentPosition(treeBody as Element) & Node.DOCUMENT_POSITION_PRECEDING)
      .toBe(Node.DOCUMENT_POSITION_PRECEDING)
  })

  it('labels a detached head as HEAD', async () => {
    renderPanel(summaryOf({ branch: null, detached: true }))
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(footer.textContent).toContain('HEAD')
  })

  it('omits the change totals when nothing is uncommitted', async () => {
    renderPanel(summaryOf({}))
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(footer.textContent).toBe('main')
  })

  it('reports when the directory is not a repository', async () => {
    renderPanel(null)
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(footer.textContent).toContain('Git 未初始化')
  })

  it('keeps the footer visible when the Host read fails', async () => {
    renderPanel(summaryOf({}), 'host refused')
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    await act(async () => { await Promise.resolve() })
    expect(footer.textContent).toContain('Git 状态不可用')
    expect(footer.title).toContain('host refused')
  })

  it('reports a Remote that is not mounted in this Client assembly', async () => {
    render(<LeftPanelMain {...propsWith(() => { throw new TypeError('cannot get property "remote.workspace" without inject') })} />)
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(footer.textContent).toContain('Git 状态不可用')
    expect(footer.title).toContain('remote.workspace')
  })

  it('is the only refresh control in the git row', async () => {
    renderPanel(summaryOf({ insertions: 1 }))
    const footer = await screen.findByRole('button', { name: '刷新 Git 状态' })
    expect(screen.getAllByRole('button', { name: '刷新 Git 状态' })).toEqual([footer])
    expect(footer.querySelector('button')).toBeNull()
  })

  it('re-reads git state when the footer is clicked', async () => {
    const gitSummary = renderPanel(summaryOf({ insertions: 1 }))
    await screen.findByRole('button', { name: '刷新 Git 状态' })
    fireEvent.click(screen.getByRole('button', { name: '刷新 Git 状态' }))
    expect(gitSummary).toHaveBeenCalledTimes(2)
    await act(async () => { await Promise.resolve() })
    expect(gitSummary).toHaveBeenLastCalledWith('ws-1', expect.any(AbortSignal))
  })
})

describe('git footer refresh progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const footer = () => screen.getByRole('button', { name: '刷新 Git 状态' })

  /** The percent on the background fill, read back from its inline custom property. */
  const progressPercent = (): number => {
    const fill = footer().querySelector('[class*="gitRefreshProgress"]') as HTMLElement
    return Number(/(\d+(?:\.\d+)?)/.exec(fill.getAttribute('style') ?? '')?.[1] ?? Number.NaN)
  }

  /** A `gitSummary` the test settles by hand. */
  function deferredGit() {
    let resolve!: (value: GitSummaryResult | null) => void
    let reject!: (reason: unknown) => void
    const gitSummary = vi.fn(() => new Promise<GitSummaryResult | null>((res, rej) => { resolve = res; reject = rej }))
    return {
      gitSummary,
      resolve: (value: GitSummaryResult | null): void => { resolve(value) },
      reject: (reason: unknown): void => { reject(reason) },
    }
  }

  it('starts the fill and marks the row busy while the read is in flight', () => {
    const { gitSummary } = deferredGit()
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    expect(gitSummary).toHaveBeenCalledTimes(1)
    expect(progressPercent()).toBe(12)
    expect(footer().getAttribute('aria-busy')).toBe('true')
  })

  it('creeps toward the in-flight ceiling and never fills before the read settles', () => {
    const { gitSummary } = deferredGit()
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(progressPercent()).toBe(85)
    expect(footer().getAttribute('aria-busy')).toBe('true')
  })

  it('fills to 100 on success, holds, then releases the busy state', async () => {
    const { gitSummary, resolve } = deferredGit()
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    // Resolve before the minimum visible duration; the bar must not jump to 100 yet.
    act(() => { vi.advanceTimersByTime(240) })
    resolve(summaryOf({ insertions: 4 }))
    await act(async () => { await Promise.resolve() })
    expect(progressPercent()).not.toBe(100)
    expect(footer().getAttribute('aria-busy')).toBe('true')
    // Advance past the minimum visible duration so the bar may settle.
    act(() => { vi.advanceTimersByTime(80) })
    expect(progressPercent()).toBe(100)
    expect(footer().getAttribute('aria-busy')).toBe('true')
    expect(footer().textContent).toContain('+4')
    act(() => { vi.advanceTimersByTime(200) })
    expect(progressPercent()).toBe(0)
    expect(footer().hasAttribute('aria-busy')).toBe(false)
  })

  it('fills to 100 on a failed read after the minimum visible duration', async () => {
    const { gitSummary, reject } = deferredGit()
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    reject(new Error('host refused'))
    await act(async () => { await Promise.resolve() })
    // Immediate rejection must not flash the bar to 100 before the minimum duration.
    expect(progressPercent()).not.toBe(100)
    expect(footer().getAttribute('aria-busy')).toBe('true')
    act(() => { vi.advanceTimersByTime(320) })
    expect(progressPercent()).toBe(100)
    expect(footer().textContent).toContain('Git 状态不可用')
  })

  it('reads a rejection that carries no Error object', async () => {
    const { gitSummary, reject } = deferredGit()
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    reject('workspace gone')
    await act(async () => { await Promise.resolve() })
    expect(footer().title).toContain('workspace gone')
    // Wait for minimum visible duration before the bar reaches 100.
    act(() => { vi.advanceTimersByTime(320) })
    expect(progressPercent()).toBe(100)
  })

  it('runs no read and leaves the fill empty without a workspace', () => {
    const gitSummary = vi.fn(async () => null)
    const store = createFileTreeStore().create('root')
    render(<LeftPanelMain {...{
      ...propsWith(gitSummary),
      useWorkspaces: (selector: (state: unknown) => unknown) => selector({ items: [], archivedSessionIds: [] }),
      useStore: bindSnapshotSelector(store),
    } as unknown as LeftPanelMainProps} />)
    expect(gitSummary).not.toHaveBeenCalled()
    expect(footer().textContent).toContain('未选择工作区')
    expect(progressPercent()).toBe(0)
    expect(footer().hasAttribute('aria-busy')).toBe(false)
  })

  it('restarts the fill on a second refresh and drops the aborted read', async () => {
    const calls: ((value: GitSummaryResult | null) => void)[] = []
    const gitSummary = vi.fn(() => new Promise<GitSummaryResult | null>((resolve) => { calls.push(resolve) }))
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.click(footer())
    expect(progressPercent()).toBe(12)
    expect(gitSummary).toHaveBeenCalledTimes(2)
    await act(async () => { await Promise.resolve() })
    expect(progressPercent()).toBe(12)
    calls[1]!(summaryOf({ insertions: 1 }))
    await act(async () => { await Promise.resolve() })
    // Fast resolve waits for the minimum visible duration before settling.
    expect(progressPercent()).not.toBe(100)
    act(() => { vi.advanceTimersByTime(320) })
    expect(progressPercent()).toBe(100)
    act(() => { vi.advanceTimersByTime(200) })
    // The superseded read settling late must not re-touch the bar or the branch.
    calls[0]!(summaryOf({ insertions: 9 }))
    await act(async () => { await Promise.resolve() })
    expect(progressPercent()).toBe(0)
    expect(footer().textContent).toContain('+1')
    expect(footer().textContent).not.toContain('+9')
  })

  it('keeps the animation visible for at least the minimum duration on a fast read', async () => {
    const { gitSummary, resolve } = deferredGit()
    render(<LeftPanelMain {...propsWith(gitSummary)} />)
    // Resolve almost immediately — well under the 320ms floor.
    act(() => { vi.advanceTimersByTime(10) })
    resolve(summaryOf({}))
    await act(async () => { await Promise.resolve() })
    expect(progressPercent()).not.toBe(100)
    expect(footer().getAttribute('aria-busy')).toBe('true')
    // Still under the floor.
    act(() => { vi.advanceTimersByTime(200) })
    expect(progressPercent()).not.toBe(100)
    expect(footer().getAttribute('aria-busy')).toBe('true')
    // Cross the floor; now the bar may settle to 100.
    act(() => { vi.advanceTimersByTime(110) })
    expect(progressPercent()).toBe(100)
  })

  it('stops the fill when the panel unmounts mid-read', async () => {
    const { gitSummary } = deferredGit()
    const view = render(<LeftPanelMain {...propsWith(gitSummary)} />)
    act(() => { vi.advanceTimersByTime(600) })
    view.unmount()
    expect(() => { act(() => { vi.advanceTimersByTime(5000) }) }).not.toThrow()
  })
})
