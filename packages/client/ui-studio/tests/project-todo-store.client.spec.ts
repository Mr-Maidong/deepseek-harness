// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createProjectTodoStore } from '../src/client/frame/project-todo-store.ts'

describe('project todo store', () => {
  beforeEach(() => { localStorage.clear() })
  it('keeps task definitions and completion summaries in one workspace store', () => {
    const store = createProjectTodoStore().create('session-a')
    store.actions.addProject({ title: 'Studio' })
    const project = store.getSnapshot().projects[0]!
    store.actions.addTodo({ projectId: project.id, title: 'Implement persistence', detail: 'Keep the original goal.' })
    const todo = store.getSnapshot().projects[0]!.todos[0]!
    store.actions.completeTodo({
      todoId: todo.id,
      summary: 'Stored the completed implementation summary.',
      implementationPath: ['Define the session store', 'Write completion atomically'],
      changedFiles: [{ path: 'frame/project-todo-store.ts', purpose: 'Own todo state and completion writes.' }],
      verification: [{ command: 'pnpm run test:gui', result: 'passed' }],
      completedAt: '2026-01-01T00:00:00.000Z',
      completedBy: 'model',
    })
    const completed = store.getSnapshot().projects[0]!.todos[0]!
    expect(completed.detail).toBe('Keep the original goal.')
    expect(completed.status).toBe('completed')
    expect(completed.updatedAt).toBe(completed.completedAt)
    expect(completed.completion?.summary).toBe('Stored the completed implementation summary.')
  })

  it('rehydrates a separate value for each session key', () => {
    const first = createProjectTodoStore().create('session-a')
    first.actions.addProject({ title: 'First session' })
    const second = createProjectTodoStore().create('session-b')
    expect(second.getSnapshot().projects).toEqual([])
    const revived = createProjectTodoStore().create('session-a')
    expect(revived.getSnapshot().projects[0]?.title).toBe('First session')
  })

  it('removes projects down to zero projects', () => {
    const store = createProjectTodoStore().create('session-c')
    store.actions.addProject({ title: 'Only Project' })
    const project = store.getSnapshot().projects[0]!
    store.actions.removeProject(project.id)
    expect(store.getSnapshot().projects).toEqual([])
  })

  it('freezes completed todos against user mutations but allows model summary updates', () => {
    const store = createProjectTodoStore().create('session-terminal')
    store.actions.addProject({ title: 'Studio' })
    const project = store.getSnapshot().projects[0]!
    store.actions.addTodo({ projectId: project.id, title: 'Ship it', detail: 'Original detail' })
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    store.actions.completeTodo({
      todoId,
      summary: 'Shipped.',
      implementationPath: ['step'],
      changedFiles: [{ path: 'a.ts', purpose: 'impl' }],
      verification: [{ command: 'pnpm run test:gui', result: 'passed' }],
      completedAt: '2026-01-02T00:00:00.000Z',
      completedBy: 'model',
    })

    // Reopen attempt is refused.
    store.actions.updateTodoStatus(todoId, 'pending')
    expect(store.getSnapshot().projects[0]!.todos[0]!.status).toBe('completed')
    // Detail edits are refused.
    store.actions.updateTodoDetail(todoId, 'mutated')
    expect(store.getSnapshot().projects[0]!.todos[0]!.detail).toBe('Original detail')
    // Deleting a completed todo is refused.
    store.actions.removeTodo(todoId)
    expect(store.getSnapshot().projects[0]!.todos).toHaveLength(1)
    // A later model completion updates the summary (iterative refinement).
    store.actions.completeTodo({
      todoId,
      summary: 'Refined with follow-up fixes.',
      implementationPath: ['step', 'follow-up'],
      changedFiles: [{ path: 'a.ts', purpose: 'impl' }, { path: 'b.ts', purpose: 'fix' }],
      verification: [{ command: 'pnpm run test:gui', result: 'passed' }],
      completedAt: '2026-01-03T00:00:00.000Z',
      completedBy: 'model',
    })
    const updated = store.getSnapshot().projects[0]!.todos[0]!
    expect(updated.completion?.summary).toBe('Refined with follow-up fixes.')
    expect(updated.updatedAt).toBe('2026-01-03T00:00:00.000Z')
  })

  it('treats user completion as terminal too', () => {
    const store = createProjectTodoStore().create('session-user-terminal')
    store.actions.addProject({ title: 'Studio' })
    const project = store.getSnapshot().projects[0]!
    store.actions.addTodo({ projectId: project.id, title: 'Note', detail: '' })
    const todoId = store.getSnapshot().projects[0]!.todos[0]!.id
    store.actions.completeTodo({
      todoId,
      summary: '',
      implementationPath: [],
      changedFiles: [],
      verification: [],
      completedAt: '2026-01-02T00:00:00.000Z',
      completedBy: 'user',
    })
    store.actions.updateTodoStatus(todoId, 'in_progress')
    expect(store.getSnapshot().projects[0]!.todos[0]!.status).toBe('completed')
    expect(store.getSnapshot().projects[0]!.todos[0]!.completion?.completedBy).toBe('user')
  })
})
