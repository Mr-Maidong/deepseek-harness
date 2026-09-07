// @vitest-environment jsdom
/**
 * File-tree workspace following: the tree lists the directory of the workspace
 * that owns the current session, and switches when the current session moves
 * to another workspace.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// component's props resolve against.
import type {} from '../src/client/index.ts'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/left-panel/locales.ts'
import { createFileTreeStore } from '../src/client/left-panel/file-tree-store.ts'
import { LeftPanelMain, type LeftPanelMainProps } from '../src/client/left-panel/LeftPanelMain.tsx'

const t: LeftPanelMainProps['t'] = makeTranslate(zh)

const firstWorkspace = { workspaceId: 'ws-1', title: 'Studio', path: '/workspace', sessionIds: ['session-1'] }
const secondWorkspace = { workspaceId: 'ws-2', title: 'Other', path: '/other', sessionIds: ['session-2'] }

/** Render the panel with two workspaces; `current` selects the active session. */
function renderPanel(current: string | undefined) {
  const store = createFileTreeStore().create('root')
  const listDirectory = vi.fn(async (path?: string) => ({ path: path ?? '', home: path ?? '', crumbs: [], truncated: false, entries: [] }))
  const props = {
    t,
    activeSection: 'project',
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    useSessions: (selector: (state: unknown) => unknown) => selector({ ids: ['session-1', 'session-2'], byId: {}, current }),
    useWorkspaces: (selector: (state: unknown) => unknown) => selector({
      items: [firstWorkspace, secondWorkspace],
      archivedSessionIds: [],
    }),
    gitSummary: vi.fn(async () => null),
    listDirectory,
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
  return { view, listDirectory, props }
}

describe('file-tree workspace following', () => {
  afterEach(cleanup)

  it('lists the directory of the workspace owning the current session', async () => {
    const { listDirectory } = renderPanel('session-1')
    await screen.findByText('/workspace')
    expect(listDirectory).toHaveBeenLastCalledWith('/workspace', expect.any(AbortSignal))
  })

  it('switches the listed directory when the current session moves workspaces', async () => {
    const { view, listDirectory, props } = renderPanel('session-1')
    await screen.findByText('/workspace')
    expect(listDirectory).toHaveBeenLastCalledWith('/workspace', expect.any(AbortSignal))

    view.rerender(<LeftPanelMain {...({
      ...props,
      useSessions: (selector: (state: unknown) => unknown) => selector({ ids: ['session-1', 'session-2'], byId: {}, current: 'session-2' }),
    } as LeftPanelMainProps)} />)
    await screen.findByText('/other')
    expect(listDirectory).toHaveBeenLastCalledWith('/other', expect.any(AbortSignal))
  })

  it('falls back to the first workspace when no session is current', async () => {
    const { listDirectory } = renderPanel(undefined)
    await screen.findByText('/workspace')
    expect(listDirectory).toHaveBeenLastCalledWith('/workspace', expect.any(AbortSignal))
  })
})
