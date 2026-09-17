// @vitest-environment jsdom
/**
 * Workbench completion acceptance: the workbench renders completion state from
 * the workspace todo store (not the session projection), and folds model
 * completions seen in the bound session's `studioTodoCompletions` projection
 * into that store — so a completion recorded in one session stays visible to
 * every session sharing the workspace.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// components' props resolve against; load it type-only so the aggregate client
// tests project sees the same props as the package program.
import type {} from '../src/client/index.ts'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkbenchTodoCompletion } from '@deepseek-ai/dsh-tool-todo/client'
import { zh } from '../src/client/left-panel/locales.ts'
import { createProjectTodoStore } from '../src/client/frame/project-todo-store.ts'
import { StudioWorkbench, type StudioWorkbenchProps } from '../src/client/frame/workbench.tsx'
import css from '../src/client/frame/Workbench.module.css'

const t: StudioWorkbenchProps['t'] = makeTranslate(zh) as never

const bodyClass = css.todoCardBody
if (bodyClass === undefined) throw new Error('todoCardBody class missing from Workbench.module.css')

const cardClass = css.todoCard
if (cardClass === undefined) throw new Error('todoCard class missing from Workbench.module.css')

const titleClass = css.todoTitle
if (titleClass === undefined) throw new Error('todoTitle class missing from Workbench.module.css')

const listClass = css.todoList
if (listClass === undefined) throw new Error('todoList class missing from Workbench.module.css')

const fadeTopClass = css.fadeTop
if (fadeTopClass === undefined) throw new Error('fadeTop class missing from Workbench.module.css')

const fadeBottomClass = css.fadeBottom
if (fadeBottomClass === undefined) throw new Error('fadeBottom class missing from Workbench.module.css')

/** Card titles in rendered (top-to-bottom) order. */
function renderedCardTitles(): string[] {
  return [...document.querySelectorAll(`.${cardClass} .${titleClass}`)].map(title => title.textContent ?? '')
}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function completion(todoId: string, summary: string, completedAt: string): WorkbenchTodoCompletion {
  return {
    todoId,
    summary,
    implementationPath: ['step'],
    changedFiles: [{ path: 'a.ts', purpose: 'impl' }],
    verification: [{ command: 'pnpm run test:gui', result: 'passed' }],
    completedAt,
    completedBy: 'model',
  }
}

interface Harness {
  store: ReturnType<ReturnType<typeof createProjectTodoStore>['create']>
  projection: ReturnType<typeof createSnapshotStore<{ value: Record<string, WorkbenchTodoCompletion> | null | undefined }>>
  /** Composer writes the workbench staged instead of sending. */
  setDraft: ReturnType<typeof vi.fn>
  /** Chat sends: write-back is the only action that still sends directly. */
  sendToChat: ReturnType<typeof vi.fn>
  rerender: (sessionId?: string) => void
  unmount: () => void
}

/**
 * Composer stubs standing in for the session-scope standard shares: the
 * workbench reads the live draft through `useInput` and stages text with
 * `inputActions.setDraft`.
 */
function composerStubs(draft: string): {
  setDraft: ReturnType<typeof vi.fn>
  useInput: StudioWorkbenchProps['useInput']
  inputActions: StudioWorkbenchProps['inputActions']
} {
  const setDraft = vi.fn()
  const snapshot = { draft }
  return {
    setDraft,
    useInput: (<S,>(selector: (state: { draft: string }) => S): S => selector(snapshot)) as StudioWorkbenchProps['useInput'],
    inputActions: {
      setDraft,
      addAttachments: vi.fn(() => true),
      removeAttachment: vi.fn(() => true),
      pruneAttachments: vi.fn(),
      submit: vi.fn(),
    },
  }
}

/** Props for one workbench render: the injected handlers plus the framework hooks. */
function workbenchProps(options: {
  store: Harness['store']
  useProjection: StudioWorkbenchProps['useProjection']
  composer: ReturnType<typeof composerStubs>
  sendToChat: ReturnType<typeof vi.fn>
  sessionId?: string
}): StudioWorkbenchProps {
  return {
    sessionId: (options.sessionId ?? 'session-a') as never,
    sendToChat: options.sendToChat,
    useInput: options.composer.useInput,
    inputActions: options.composer.inputActions,
    t,
    useStore: bindSnapshotSelector(options.store),
    actions: options.store.actions,
    useProjection: options.useProjection,
  } as unknown as StudioWorkbenchProps
}

function renderWorkbench(options: { draft?: string; sourceSessionId?: string } = {}): Harness {
  const store = createProjectTodoStore().create('workspace-1')
  store.actions.addProject({ title: 'Studio' })
  const projectId = store.getSnapshot().projects[0]!.id
  store.actions.addTodo({
    projectId,
    title: 'Ship persistence',
    detail: 'Keep it durable.',
    // exactOptionalPropertyTypes: an absent source is expressed by omission.
    ...(options.sourceSessionId === undefined ? {} : { sourceSessionId: options.sourceSessionId }),
  })
  const projection = createSnapshotStore<{ value: Record<string, WorkbenchTodoCompletion> | null | undefined }>({ value: undefined })

  const useProjection = ((_key: string, selector?: (v: unknown) => unknown) =>
    bindSnapshotSelector(projection)(s => (selector ?? (v => v))(s.value))) as StudioWorkbenchProps['useProjection']

  const composer = composerStubs(options.draft ?? '')
  const sendToChat = vi.fn(async () => {})
  const props = (sessionId: string): StudioWorkbenchProps =>
    workbenchProps({ store, useProjection, composer, sendToChat, sessionId })

  const view = render(<StudioWorkbench {...props('session-a')} />)
  return {
    store,
    projection,
    setDraft: composer.setDraft,
    sendToChat,
    rerender: (sessionId = 'session-b') => view.rerender(<StudioWorkbench {...props(sessionId)} />),
    unmount: () => view.unmount(),
  }
}

describe('StudioWorkbench completion reconcile', () => {
  it('renders a store-completed todo with its summary and locks every mutation', () => {
    const { store } = renderWorkbench()
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    act(() => {
      store.actions.completeTodo({
        todoId,
        summary: 'Durability shipped.',
        implementationPath: ['fold'],
        changedFiles: [{ path: 'store.ts', purpose: 'persist' }],
        verification: [{ command: 'pnpm run test:gui', result: 'passed' }],
        completedAt: '2026-01-01T00:00:00.000Z',
        completedBy: 'model',
      })
    })
    expect(screen.getByText('Durability shipped.')).toBeTruthy()
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(true)
    // A completed todo is a terminal record the store never deletes, so the
    // workbench hides its delete button outright.
    expect(screen.queryByRole('button', { name: '删除事项' })).toBeNull()
    expect(screen.getByRole('button', { name: '调用模型生成总结并写回' })).toHaveProperty('disabled', true)
  })

  it('folds a projected model completion into the workspace store on sight', () => {
    const { store, projection } = renderWorkbench()
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    act(() => {
      projection.set({ value: { [todoId]: completion(todoId, 'Folded summary.', '2026-01-02T00:00:00.000Z') } })
    })
    const stored = store.getSnapshot().projects[0]!.todos[0]!
    expect(stored.status).toBe('completed')
    expect(stored.completion?.summary).toBe('Folded summary.')
    // Rendered from the store, so the summary is visible.
    expect(screen.getByText('Folded summary.')).toBeTruthy()
  })

  it('folds the projection baseline present on mount (completion recorded in a prior visit)', () => {
    const store = createProjectTodoStore().create('workspace-1')
    store.actions.addProject({ title: 'Studio' })
    const projectId = store.getSnapshot().projects[0]!.id
    store.actions.addTodo({ projectId, title: 'Later task', detail: '' })
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    // Simulate the session projection baseline already carrying the completion
    // when the workbench mounts under that session.
    const projection = createSnapshotStore<{ value: Record<string, WorkbenchTodoCompletion> | null | undefined }>({
      value: { [todoId]: completion(todoId, 'Baseline summary.', '2026-01-03T00:00:00.000Z') },
    })
    const useProjection = (_key: string, selector?: (v: unknown) => unknown) =>
      bindSnapshotSelector(projection)(s => (selector ?? (v => v))(s.value))
    const props = workbenchProps({
      store,
      useProjection,
      composer: composerStubs(''),
      sendToChat: vi.fn(async () => {}),
    })
    render(<StudioWorkbench {...props} />)
    const stored = store.getSnapshot().projects[0]!.todos[0]!
    expect(stored.status).toBe('completed')
    expect(stored.completion?.summary).toBe('Baseline summary.')
  })

  it('renders an arbitrarily long todo title in one title node without dropping the controls', () => {
    // jsdom cannot measure text-overflow, but the styling contract is that a
    // long title stays one nowrap span (clipped with an ellipsis in the real
    // browser) and the checkbox/actions row keeps its layout.
    const longTitle = '事项标题'.repeat(40)
    const store = createProjectTodoStore().create('workspace-1')
    store.actions.addProject({ title: 'Studio' })
    const projectId = store.getSnapshot().projects[0]!.id
    store.actions.addTodo({ projectId, title: longTitle, detail: '' })
    const projection = createSnapshotStore<{ value: Record<string, WorkbenchTodoCompletion> | null | undefined }>({ value: undefined })
    const useProjection = (_key: string, selector?: (v: unknown) => unknown) =>
      bindSnapshotSelector(projection)(s => (selector ?? (v => v))(s.value))
    const props = workbenchProps({
      store,
      useProjection,
      composer: composerStubs(''),
      sendToChat: vi.fn(async () => {}),
    })
    render(<StudioWorkbench {...props} />)
    const titles = [...document.querySelectorAll(`.${titleClass}`)]
    expect(titles).toHaveLength(1)
    expect(titles[0]!.textContent).toBe(longTitle)
    // The checkbox (title row) and the three actions all stay rendered.
    const card = titles[0]!.closest(`.${cardClass}`)!
    expect(card.querySelector('input[type="checkbox"]')).toBeTruthy()
    // Three action buttons plus the detail and expand buttons in the foot.
    expect(card.querySelectorAll('button')).toHaveLength(5)
  })

  it('does not reopen a store-completed todo when the projection changes away', () => {
    const { store, projection } = renderWorkbench()
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    act(() => {
      store.actions.completeTodo({
        todoId,
        summary: 'Done.',
        implementationPath: [],
        changedFiles: [],
        verification: [],
        completedAt: '2026-01-01T00:00:00.000Z',
        completedBy: 'user',
      })
    })
    // A session switch empties the projection (different session's store).
    act(() => { projection.set({ value: null }) })
    expect(store.getSnapshot().projects[0]!.todos[0]!.status).toBe('completed')
    expect(screen.getByText('Done.')).toBeTruthy()
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('marking an uncompleted todo done is terminal in the store and disables its controls', () => {
    const { store } = renderWorkbench()
    fireEvent.click(screen.getByRole('checkbox'))
    const stored = store.getSnapshot().projects[0]!.todos[0]!
    expect(stored.status).toBe('completed')
    expect(stored.completion?.completedBy).toBe('user')
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('separates detail from summary with a localized Summary divider', () => {
    const { store } = renderWorkbench()
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    act(() => {
      store.actions.completeTodo({
        todoId,
        summary: 'Shipped the fold.',
        implementationPath: [],
        changedFiles: [],
        verification: [],
        completedAt: '2026-01-01T00:00:00.000Z',
        completedBy: 'model',
      })
    })
    const divider = screen.getByRole('separator', { name: 'Summary' })
    expect(divider.textContent).toBe('Summary')
    // Detail and summary render on the scrollable body between head and foot.
    expect(divider.parentElement).toBe(screen.getByText('Keep it durable.').closest(`.${bodyClass}`))
  })

  it('dates each card footer with relative update time', () => {
    vi.useFakeTimers()
    try {
      const { store } = renderWorkbench()
      act(() => {
        store.actions.updateTodoDetail(store.getSnapshot().projects[0]!.todos[0]!.id, 'Fresh detail.')
      })
      expect(screen.getByText('刚刚更新')).toBeTruthy()
      // The tick keeps buckets fresh without store writes.
      act(() => { vi.advanceTimersByTime(31_000) })
      expect(screen.getByText('刚刚更新')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('lists cards newest-updated first and reorders when an older card is touched', () => {
    vi.useFakeTimers()
    try {
      const { store } = renderWorkbench()
      const projectId = store.getSnapshot().projects[0]!.id
      const oldest = store.getSnapshot().projects[0]!.todos[0]!.id
      act(() => {
        vi.advanceTimersByTime(1_000)
        store.actions.addTodo({ projectId, title: 'Second task', detail: '' })
        vi.advanceTimersByTime(1_000)
        store.actions.addTodo({ projectId, title: 'Third task', detail: '' })
      })
      expect(renderedCardTitles()).toEqual(['Third task', 'Second task', 'Ship persistence'])
      // A detail edit makes the oldest card the most recently updated one.
      act(() => {
        vi.advanceTimersByTime(1_000)
        store.actions.updateTodoDetail(oldest, 'Revised detail.')
      })
      expect(renderedCardTitles()).toEqual(['Ship persistence', 'Third task', 'Second task'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('pins an uncompleted card above a completed one whatever their update times', () => {
    vi.useFakeTimers()
    try {
      const { store } = renderWorkbench()
      const projectId = store.getSnapshot().projects[0]!.id
      act(() => {
        vi.advanceTimersByTime(1_000)
        store.actions.addTodo({ projectId, title: 'Second task', detail: '' })
      })
      const second = store.getSnapshot().projects[0]!.todos[1]!.id
      // Completing the newest card makes it the most recently updated one, yet
      // the older uncompleted card stays pinned above it.
      act(() => {
        vi.advanceTimersByTime(1_000)
        store.actions.completeTodo({
          todoId: second,
          summary: 'Shipped the fold.',
          implementationPath: [],
          changedFiles: [],
          verification: [],
          completedAt: new Date().toISOString(),
          completedBy: 'model',
        })
      })
      expect(renderedCardTitles()).toEqual(['Ship persistence', 'Second task'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('orders completed cards by their completion time, not their creation time', () => {
    vi.useFakeTimers()
    try {
      const { store } = renderWorkbench()
      const projectId = store.getSnapshot().projects[0]!.id
      const first = store.getSnapshot().projects[0]!.todos[0]!.id
      act(() => {
        vi.advanceTimersByTime(1_000)
        store.actions.addTodo({ projectId, title: 'Second task', detail: '' })
      })
      const second = store.getSnapshot().projects[0]!.todos[1]!.id
      act(() => {
        vi.advanceTimersByTime(1_000)
        store.actions.completeTodo({
          todoId: first,
          summary: 'Shipped the first.',
          implementationPath: [],
          changedFiles: [],
          verification: [],
          completedAt: new Date().toISOString(),
          completedBy: 'model',
        })
        vi.advanceTimersByTime(1_000)
        store.actions.completeTodo({
          todoId: second,
          summary: 'Shipped the second.',
          implementationPath: [],
          changedFiles: [],
          verification: [],
          completedAt: new Date().toISOString(),
          completedBy: 'model',
        })
      })
      expect(renderedCardTitles()).toEqual(['Second task', 'Ship persistence'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders each card body as the scrollable container between head and foot', () => {
    renderWorkbench()
    const body = document.querySelector(`.${bodyClass}`) as HTMLElement
    expect(body).toBeTruthy()
    // Detail and summary live inside the scroll region; head and foot do not.
    expect(screen.getByText('Keep it durable.').closest(`.${bodyClass}`)).toBe(body)
    expect(body.querySelector('.todoCardFoot, [class*="todoCardFoot"]')).toBeNull()
    expect(body.parentElement!.querySelector('[class*="todoCardFoot"]')).toBeTruthy()
  })

  it('collapses and expands the card detail from the footer button', () => {
    renderWorkbench()
    const body = document.querySelector(`.${bodyClass}`) as HTMLElement
    const toggle = screen.getByRole('button', { name: '收起详情' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Keep it durable.')).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: '展开详情' })).toBeTruthy()
    expect(body.hasAttribute('data-collapsed')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '展开详情' }))
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(body.hasAttribute('data-collapsed')).toBe(false)
  })

  it('collapses a completed todo by default and expands it on demand', () => {
    const { store } = renderWorkbench()
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    act(() => {
      store.actions.completeTodo({
        todoId,
        summary: 'Shipped the fold.',
        implementationPath: [],
        changedFiles: [],
        verification: [],
        completedAt: '2026-01-01T00:00:00.000Z',
        completedBy: 'model',
      })
    })
    const body = document.querySelector(`.${bodyClass}`) as HTMLElement
    expect(body.hasAttribute('data-collapsed')).toBe(true)
    expect(screen.getByRole('button', { name: '展开详情' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '展开详情' }))
    expect(body.hasAttribute('data-collapsed')).toBe(false)
    expect(screen.getByText('Shipped the fold.')).toBeTruthy()
  })
})

describe('StudioWorkbench todo list end fades', () => {
  /** Scroll metrics jsdom never lays out: the list as a scroller taller than its box. */
  function scrollable(list: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(list, 'scrollHeight', { value: scrollHeight, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: clientHeight, configurable: true })
  }

  it('fades only the ends the list can still scroll toward', () => {
    renderWorkbench()
    const list = document.querySelector(`.${listClass}`) as HTMLElement
    // Content that fits its scrollport scrolls nowhere, so neither end fades.
    expect(list.className).not.toContain(fadeTopClass)
    expect(list.className).not.toContain(fadeBottomClass)

    scrollable(list, 600, 200)
    fireEvent.scroll(list)
    expect(list.className).not.toContain(fadeTopClass)
    expect(list.className).toContain(fadeBottomClass)

    // Mid-list: each end hides a card.
    list.scrollTop = 200
    fireEvent.scroll(list)
    expect(list.className).toContain(fadeTopClass)
    expect(list.className).toContain(fadeBottomClass)

    // Last screen: only the top end still hides a card.
    list.scrollTop = 400
    fireEvent.scroll(list)
    expect(list.className).toContain(fadeTopClass)
    expect(list.className).not.toContain(fadeBottomClass)

    // Re-reading ends that did not move leaves the classes alone.
    fireEvent.scroll(list)
    expect(list.className).toContain(fadeTopClass)
    expect(list.className).not.toContain(fadeBottomClass)
  })

  it('re-reads the ends when the list box resizes, and stops watching on unmount', () => {
    const observed: Element[] = []
    const disconnect = vi.fn()
    let resize: ResizeObserverCallback | undefined
    class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe(target: Element): void { observed.push(target) }
      disconnect(): void { disconnect() }
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)

    const { unmount } = renderWorkbench()
    const list = document.querySelector(`.${listClass}`) as HTMLElement
    expect(observed).toEqual([list])

    // A panel resize moves the overflow edge with no scroll and no render.
    scrollable(list, 600, 200)
    act(() => { resize!([], {} as ResizeObserver) })
    expect(list.className).toContain(fadeBottomClass)

    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('fades nothing while the workspace has no project, because it renders no list', () => {
    const store = createProjectTodoStore().create('workspace-1')
    const projection = createSnapshotStore<{ value: Record<string, WorkbenchTodoCompletion> | null | undefined }>({ value: undefined })
    const useProjection = (_key: string, selector?: (v: unknown) => unknown) =>
      bindSnapshotSelector(projection)(s => (selector ?? (v => v))(s.value))
    const props = workbenchProps({
      store,
      useProjection,
      composer: composerStubs(''),
      sendToChat: vi.fn(async () => {}),
    })
    const view = render(<StudioWorkbench {...props} />)
    expect(document.querySelector(`.${listClass}`)).toBeNull()
    view.unmount()
  })
})

describe('StudioWorkbench staging into the composer', () => {
  /** The staged text for the harness's single todo, as the composer receives it. */
  function stagedSingle(store: Harness['store']): string {
    const todo = store.getSnapshot().projects[0]!.todos[0]!
    return `${todo.title}（todoId: ${todo.id}）\n${todo.detail}`
  }

  it('stages one todo in the composer instead of sending it, leaving its status alone', () => {
    const { store, setDraft, sendToChat } = renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: '发送单条事项到输入框' }))
    expect(setDraft).toHaveBeenCalledWith(stagedSingle(store))
    // Staging hands the message to the user, so nothing reaches the model yet.
    expect(sendToChat).not.toHaveBeenCalled()
    expect(store.getSnapshot().projects[0]!.todos[0]!.status).toBe('pending')
  })

  it('appends the staged todo to the draft already in the composer', () => {
    const { store, setDraft } = renderWorkbench({ draft: '已经打好的内容' })
    fireEvent.click(screen.getByRole('button', { name: '发送单条事项到输入框' }))
    expect(setDraft).toHaveBeenCalledWith(`已经打好的内容\n${stagedSingle(store)}`)
  })

  it('treats a whitespace-only draft as empty rather than stacking blank lines', () => {
    const { store, setDraft } = renderWorkbench({ draft: '  \n ' })
    fireEvent.click(screen.getByRole('button', { name: '发送单条事项到输入框' }))
    expect(setDraft).toHaveBeenCalledWith(stagedSingle(store))
  })

  it('stages every pending todo as bullets and skips the completed ones', () => {
    const { store, setDraft, sendToChat } = renderWorkbench()
    const projectId = store.getSnapshot().projects[0]!.id
    store.actions.addTodo({ projectId, title: 'Second task', detail: 'Also durable.' })
    const first = store.getSnapshot().projects[0]!.todos[0]!
    act(() => {
      store.actions.completeTodo({
        todoId: first.id,
        summary: 'Done first.',
        implementationPath: [],
        changedFiles: [],
        verification: [],
        completedAt: '2026-01-01T00:00:00.000Z',
        completedBy: 'model',
      })
    })
    fireEvent.click(screen.getByRole('button', { name: '发送事项到输入框' }))
    const pending = store.getSnapshot().projects[0]!.todos.find(todo => todo.status !== 'completed')!
    expect(setDraft).toHaveBeenCalledWith(`- ${pending.title}（todoId: ${pending.id}）\n  ${pending.detail}`)
    expect(sendToChat).not.toHaveBeenCalled()
  })

  it('still sends the write-back request straight to the chat without staging it', async () => {
    // Write-back is offered only on a todo this session authored.
    const { store, setDraft, sendToChat } = renderWorkbench({ sourceSessionId: 'session-a' })
    fireEvent.click(screen.getByRole('button', { name: '调用模型生成总结并写回' }))
    await waitFor(() => { expect(sendToChat).toHaveBeenCalledTimes(1) })
    expect(setDraft).not.toHaveBeenCalled()
    // The record is the whole task, so the request asks for every round of it:
    // `workbench_complete` replaces this todo's earlier record on recall.
    const todo = store.getSnapshot().projects[0]!.todos[0]!
    const [request] = sendToChat.mock.calls[0] as [string]
    expect(request).toContain(`Ship persistence（todoId: ${todo.id}）`)
    expect(request).toContain('从开始到现在的完整成果')
    expect(request).toContain('不要只写最后一轮改动')
  })
})

describe('StudioWorkbench project removal confirmation', () => {
  it('asks before removing the active project and keeps it when dismissed', () => {
    const { store } = renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: '移除项目' }))
    expect(screen.getByRole('dialog', { name: '移除项目？' })).toBeTruthy()
    expect(store.getSnapshot().projects).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.getSnapshot().projects).toHaveLength(1)
  })

  it('removes the project and its todos only when the dialog confirms', () => {
    const { store } = renderWorkbench()
    fireEvent.click(screen.getByRole('button', { name: '移除项目' }))
    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.getSnapshot().projects).toEqual([])
    expect(document.querySelectorAll(`.${cardClass}`)).toHaveLength(0)
  })
})
