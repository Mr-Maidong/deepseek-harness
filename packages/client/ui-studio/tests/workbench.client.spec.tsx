// @vitest-environment jsdom
/**
 * Workbench completion acceptance: the workbench renders completion state from
 * the workspace todo store (not the session projection), and folds model
 * completions seen in the bound session's `studioTodoCompletions` projection
 * into that store — so a completion recorded in one session stays visible to
 * every session sharing the workspace.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

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
  rerender: (sessionId?: string) => void
  unmount: () => void
}

function renderWorkbench(): Harness {
  const store = createProjectTodoStore().create('workspace-1')
  store.actions.addProject({ title: 'Studio' })
  const projectId = store.getSnapshot().projects[0]!.id
  store.actions.addTodo({ projectId, title: 'Ship persistence', detail: 'Keep it durable.' })
  const projection = createSnapshotStore<{ value: Record<string, WorkbenchTodoCompletion> | null | undefined }>({ value: undefined })

  const useProjection = (_key: string, selector?: (v: unknown) => unknown) =>
    bindSnapshotSelector(projection)(s => (selector ?? (v => v))(s.value))

  const props = (sessionId: string): StudioWorkbenchProps => ({
    sessionId: sessionId as never,
    sendToChat: vi.fn(async () => {}),
    t,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    useProjection: useProjection as StudioWorkbenchProps['useProjection'],
  } as unknown as StudioWorkbenchProps)

  const view = render(<StudioWorkbench {...props('session-a')} />)
  return {
    store,
    projection,
    rerender: (sessionId = 'session-b') => view.rerender(<StudioWorkbench {...props(sessionId)} />),
    unmount: () => view.unmount(),
  }
}

describe('StudioWorkbench completion reconcile', () => {
  it('renders a store-completed todo with its summary and disables every mutation', () => {
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
    expect(screen.getByRole('button', { name: '删除灵光' })).toHaveProperty('disabled', true)
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
    const props: StudioWorkbenchProps = {
      sessionId: 'session-a' as never,
      sendToChat: vi.fn(async () => {}),
      t,
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      useProjection: useProjection as StudioWorkbenchProps['useProjection'],
    } as unknown as StudioWorkbenchProps
    render(<StudioWorkbench {...props} />)
    const stored = store.getSnapshot().projects[0]!.todos[0]!
    expect(stored.status).toBe('completed')
    expect(stored.completion?.summary).toBe('Baseline summary.')
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
