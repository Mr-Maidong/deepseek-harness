// @vitest-environment jsdom
/**
 * Running session status in the workspace list: a running session's row shows
 * the ongoing matrix animation where an idle row keeps the static conversation
 * icon, and a collapsed workspace carries that animation before its name
 * because collapsing hides the rows that would otherwise show it.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// component's props resolve against.
import type {} from '../src/client/index.ts'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/left-panel/locales.ts'
import { createFileTreeStore } from '../src/client/left-panel/file-tree-store.ts'
import { LeftPanelMain, type LeftPanelMainProps } from '../src/client/left-panel/LeftPanelMain.tsx'

const t: LeftPanelMainProps['t'] = makeTranslate(zh)

const expandedWorkspace = { workspaceId: 'ws-1', title: 'Studio', path: '/studio', sessionIds: ['s-run', 's-idle'] }
const runningWorkspace = { workspaceId: 'ws-2', title: 'Other', path: '/other', sessionIds: ['s-other-run'] }
const quietWorkspace = { workspaceId: 'ws-3', title: 'Quiet', path: '/quiet', sessionIds: ['s-quiet-idle'] }

/** One session summary slice as the workspace list reads it. */
const summary = (id: string, displayTitle: string, running: boolean) =>
  ({ id, displayTitle, running, blank: false, updatedAt: 0 })

const byId = {
  's-run': summary('s-run', 'Running one', true),
  's-idle': summary('s-idle', 'Idle two', false),
  's-other-run': summary('s-other-run', 'Other running', true),
  's-quiet-idle': summary('s-quiet-idle', 'Quiet idle', false),
}

/** Render the panel with the current session inside the first workspace, which stays expanded. */
function renderPanel() {
  const store = createFileTreeStore().create('root')
  const listState = {
    ids: Object.keys(byId),
    byId,
    current: 's-run',
  }
  const workspaceState = {
    items: [expandedWorkspace, runningWorkspace, quietWorkspace],
    archivedSessionIds: [],
  }
  const props = {
    t,
    activeSection: 'project',
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    useSessions: (selector: (state: unknown) => unknown) => selector(listState),
    useWorkspaces: (selector: (state: unknown) => unknown) => selector(workspaceState),
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
    createWorkspace: vi.fn(),
    renderSlot: () => null,
  } as unknown as LeftPanelMainProps
  const view = render(<LeftPanelMain {...props} />)
  const sessionButton = (title: string) => screen.getByText(title).closest('button') as HTMLButtonElement
  const workspaceToggle = (title: string) => screen.getByText(title).closest('button') as HTMLButtonElement
  return { view, sessionButton, workspaceToggle }
}

/** The animation precedes the given label in document order, so it draws in front of it. */
function expectBefore(animation: Element | null | undefined, label: HTMLElement): void {
  expect(animation).not.toBeNull()
  expect((animation as Element).compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('workspace list running status', () => {
  afterEach(cleanup)

  it('replaces the static session icon with the ongoing matrix while a session runs', () => {
    const { sessionButton } = renderPanel()
    const running = sessionButton('Running one')
    expectBefore(running.querySelector('svg[data-state="ongoing"]'), screen.getByText('Running one'))
    expect(within(running).getByText('运行中')).toBeTruthy()
    // An idle row keeps the static conversation icon: no status animation exists.
    expect(sessionButton('Idle two').querySelector('svg')).toBeNull()
  })

  it('carries the animation in front of a collapsed workspace name', () => {
    const { workspaceToggle } = renderPanel()
    const toggle = workspaceToggle('Other')
    const dot = toggle.querySelector('svg[data-state="ongoing"]')
    expectBefore(dot, screen.getByText('Other'))
    expect(within(toggle).getByText('运行中')).toBeTruthy()
    // Chevron, status slot, name: the animation owns a slot of its own.
    expect(toggle.children).toHaveLength(3)
  })

  it('keeps the header clear while the workspace is expanded', () => {
    const { workspaceToggle } = renderPanel()
    expect(workspaceToggle('Studio').querySelector('svg')).toBeNull()
  })

  it('leaves no placeholder in a collapsed workspace with nothing running', () => {
    const { workspaceToggle } = renderPanel()
    const toggle = workspaceToggle('Quiet')
    expect(toggle.querySelector('svg')).toBeNull()
    // Chevron and name only: an idle collapsed card keeps no blank status slot.
    expect(toggle.children).toHaveLength(2)
  })

  it('moves the animation onto the name when the workspace collapses', () => {
    const { workspaceToggle } = renderPanel()
    const toggle = workspaceToggle('Studio')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    const dot = workspaceToggle('Studio').querySelector('svg[data-state="ongoing"]')
    expectBefore(dot, screen.getByText('Studio'))
    expect(workspaceToggle('Studio').getAttribute('aria-expanded')).toBe('false')
  })
})
