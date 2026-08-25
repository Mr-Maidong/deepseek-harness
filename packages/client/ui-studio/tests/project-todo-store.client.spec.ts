// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createProjectTodoStore } from '../src/client/frame/project-todo-store.ts'

describe('project todo store', () => {
  beforeEach(() => { localStorage.clear() })
  it('keeps task definitions and completion summaries in one session store', () => {
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
})
