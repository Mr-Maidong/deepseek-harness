// @vitest-environment jsdom
/**
 * The Add workspace trigger lives in the workspace section header, immediately
 * left of that section's expand control, and raises the directory flow whose
 * occupant and failure surface are rendered by the workspace list.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// component's props resolve against.
import type {} from '../src/client/index.ts'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/left-panel/locales.ts'
import { createFileTreeStore } from '../src/client/left-panel/file-tree-store.ts'
import { LeftPanelMain, type LeftPanelMainProps } from '../src/client/left-panel/LeftPanelMain.tsx'

const t: LeftPanelMainProps['t'] = makeTranslate(zh)

const workspace = { workspaceId: 'ws-1', title: 'Studio', path: '/workspace', sessionIds: ['session-1'] }

/** The owner conversation of the last `studio.workspace.directoryFlow` render. */
type FlowOwner = {
  open: boolean
  busy: boolean
  onPicked: (path: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

/** Render the panel, capturing every directory-flow render through `renderSlot`. */
function renderPanel(overrides: Partial<LeftPanelMainProps> = {}) {
  const store = createFileTreeStore().create('root')
  const renderSlot = vi.fn((_name: string, _owner: unknown) => null)
  const createWorkspace = vi.fn(async () => workspace)
  const props = {
    t,
    activeSection: 'project',
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    useSessions: (selector: (state: unknown) => unknown) => selector({ ids: ['session-1'], byId: {}, current: 'session-1' }),
    useWorkspaces: (selector: (state: unknown) => unknown) => selector({ items: [workspace], archivedSessionIds: [] }),
    gitSummary: vi.fn(async () => null),
    listDirectory: vi.fn(async (path?: string) => ({ path: path ?? '', home: path ?? '', crumbs: [], truncated: false, entries: [] })),
    readFile: vi.fn(async () => ({ path: '', content: '' })),
    onPreview: vi.fn(),
    startSession: vi.fn(),
    open: vi.fn(),
    archiveSession: vi.fn(),
    renameSession: vi.fn(),
    renameWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    forkSession: vi.fn(),
    createWorkspace,
    renderSlot,
    ...overrides,
  } as unknown as LeftPanelMainProps
  const view = render(<LeftPanelMain {...props} />)
  const flowOwner = (): FlowOwner =>
    renderSlot.mock.calls.filter(([name]) => name === 'studio.workspace.directoryFlow').at(-1)![1] as FlowOwner
  const add = () => screen.getByRole('button', { name: '添加工作区' })
  return { view, props, renderSlot, flowOwner, add, createWorkspace }
}

describe('workspace add trigger', () => {
  beforeEach(() => {
    // The section-toggle store persists; a stale snapshot would flip from a
    // value the previous spec wrote.
    localStorage.clear()
  })
  afterEach(cleanup)

  it('sits in the workspace section header, left of the expand control', () => {
    const { add } = renderPanel()
    const title = screen.getByRole('button', { name: '工作区' })
    const header = title.parentElement as HTMLElement
    const buttons = Array.from(header.querySelectorAll('button'))
    expect(buttons).toEqual([title, add(), expect.anything()])
    fireEvent.click(buttons[2] as HTMLElement)
    expect(title.getAttribute('aria-expanded')).toBe('false')
  })

  it('toggles each section from its title and from its chevron', async () => {
    renderPanel()
    const workBaseTitle = screen.getByRole('button', { name: '工作区' })
    const fileTreeTitle = screen.getByRole('button', { name: '文件树' })
    // The expand chevron is the header's last control in both sections.
    const chevronOf = (title: HTMLElement) => {
      const buttons = (title.parentElement as HTMLElement).querySelectorAll('button')
      return buttons[buttons.length - 1] as HTMLElement
    }
    fireEvent.click(chevronOf(workBaseTitle))
    await waitFor(() => { expect(workBaseTitle.getAttribute('aria-expanded')).toBe('false') })
    fireEvent.click(chevronOf(fileTreeTitle))
    await waitFor(() => { expect(fileTreeTitle.getAttribute('aria-expanded')).toBe('false') })
    fireEvent.click(fileTreeTitle)
    await waitFor(() => { expect(fileTreeTitle.getAttribute('aria-expanded')).toBe('true') })
    fireEvent.click(workBaseTitle)
    await waitFor(() => { expect(workBaseTitle.getAttribute('aria-expanded')).toBe('true') })
  })

  it('raises the directory flow on click and withdraws it on cancel', () => {
    const { add: addButton, flowOwner } = renderPanel()
    fireEvent.click(addButton())
    expect(flowOwner().open).toBe(true)
    act(() => { flowOwner().onCancel() })
    expect(flowOwner().open).toBe(false)
  })

  it('adopts a picked path and closes the flow once the workspace exists', async () => {
    const { add: addButton, flowOwner, createWorkspace } = renderPanel()
    fireEvent.click(addButton())
    act(() => { flowOwner().onPicked('/new-place') })
    expect(createWorkspace).toHaveBeenCalledWith({ path: '/new-place' })
    await waitFor(() => { expect(flowOwner().open).toBe(false) })
    expect(screen.queryByText('无法添加工作区，请重试。')).toBeNull()
  })

  it('reports a failed add, keeps the flow open, and re-enables the trigger', async () => {
    const { add: addButton, flowOwner } = renderPanel({
      createWorkspace: vi.fn(async () => { throw new Error('denied') }),
    })
    fireEvent.click(addButton())
    act(() => { flowOwner().onPicked('/nope') })
    await screen.findByText('无法添加工作区，请重试。')
    expect(flowOwner().open).toBe(true)
    expect(addButton().hasAttribute('disabled')).toBe(false)
  })

  it('shows a flow failure in the workspace list and closes the flow', () => {
    const { add: addButton, flowOwner } = renderPanel()
    fireEvent.click(addButton())
    act(() => { flowOwner().onError('路径不可读') })
    expect(screen.getByText('路径不可读')).toBeTruthy()
    expect(flowOwner().open).toBe(false)
  })
})
