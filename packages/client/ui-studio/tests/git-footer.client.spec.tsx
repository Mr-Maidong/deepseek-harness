// @vitest-environment jsdom
/**
 * File-tree git footer: the bar below the tree shows the branch and uncommitted
 * totals the Host reports for the root Workspace, reports non-repository workspaces,
 * and re-reads on click.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

/** Render the panel with one root Workspace; `failure` makes the Host read reject. */
function renderPanel(gitSummaryResult: GitSummaryResult | null, failure?: string) {
  const store = createFileTreeStore().create('root')
  const gitSummary = vi.fn(async () => {
    if (failure !== undefined) throw new Error(failure)
    return gitSummaryResult
  })
  const props = {
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
  render(<LeftPanelMain {...props} />)
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
    const store = createFileTreeStore().create('root')
    const props = {
      t,
      activeSection: 'project',
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      useSessions: (selector: (state: unknown) => unknown) => selector({ ids: [], byId: {}, current: undefined }),
      useWorkspaces: (selector: (state: unknown) => unknown) => selector({ items: [workspace], archivedSessionIds: [] }),
      gitSummary: () => { throw new TypeError('cannot get property "remote.workspace" without inject') },
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
    render(<LeftPanelMain {...props} />)
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
