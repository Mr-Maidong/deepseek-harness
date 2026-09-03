import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Lifecycle state for one project todo. */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

/** Structured result written when a todo is completed. */
export type TodoCompletion = {
  summary: string
  implementationPath: string[]
  changedFiles: Array<{ path: string; purpose: string }>
  verification: Array<{ command: string; result: 'passed' | 'failed' | 'skipped'; note?: string | undefined }>
  completedAt: string
  completedBy: 'model' | 'user'
}

/** Durable project todo definition and execution state. */
export type ProjectTodo = {
  id: string
  projectId: string
  title: string
  detail: string
  status: TodoStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  completion?: TodoCompletion
  sourceSessionId?: string
  sourceTurnId?: string
  tags?: string[]
}

/** A named collection of todos in the current session. */
export type ProjectBoard = { id: string; title: string; todos: ProjectTodo[] }

/** Completion payload accepted by the atomic completion action. */
export type TodoCompletionInput = TodoCompletion & { todoId: string }

type ProjectTodoState = { projects: ProjectBoard[] }

type ProjectTodoActions = {
  addProject: (draft: ProjectTodoState, input: { title: string }) => void
  removeProject: (draft: ProjectTodoState, projectId: string) => void
  addTodo: (draft: ProjectTodoState, input: { projectId: string; title: string; detail: string; sourceSessionId?: string }) => void
  updateTodoDetail: (draft: ProjectTodoState, todoId: string, detail: string) => void
  updateTodoStatus: (draft: ProjectTodoState, todoId: string, status: TodoStatus) => void
  completeTodo: (draft: ProjectTodoState, input: TodoCompletionInput) => void
  removeTodo: (draft: ProjectTodoState, todoId: string) => void
}

function createId(): string {
  return randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

function findTodo(state: ProjectTodoState, todoId: string): ProjectTodo | undefined {
  for (const project of state.projects) {
    const todo = project.todos.find(item => item.id === todoId)
    if (todo !== undefined) return todo
  }
  return undefined
}

/** Create the workspace-scoped store that persists one todo pool per Workspace. */
export function createProjectTodoStore(): EngineStoreHandle<ProjectTodoState, ProjectTodoActions> {
  return defineStore({
    init: (): ProjectTodoState => ({ projects: [] }),
    persist: 'dsh.studio.project-todos.v1',
    actions: {
      addProject: (draft, input) => {
        const title = input.title.trim()
        if (title === '') return
        draft.projects.push({ id: createId(), title, todos: [] })
      },
      removeProject: (draft, projectId) => {
        draft.projects = draft.projects.filter(project => project.id !== projectId)
      },
      addTodo: (draft, input) => {
        const title = input.title.trim()
        const project = draft.projects.find(item => item.id === input.projectId)
        if (title === '' || project === undefined) return
        const timestamp = now()
        project.todos.push({
          id: createId(),
          projectId: input.projectId,
          title,
          detail: input.detail,
          status: 'pending',
          ...(input.sourceSessionId === undefined ? {} : { sourceSessionId: input.sourceSessionId }),
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      },
      updateTodoDetail: (draft, todoId, detail) => {
        const todo = findTodo(draft, todoId)
        // A completed todo is a terminal record: its detail is frozen.
        if (todo === undefined || todo.status === 'completed') return
        todo.detail = detail
        todo.updatedAt = now()
      },
      updateTodoStatus: (draft, todoId, status) => {
        const todo = findTodo(draft, todoId)
        // Completion is terminal: a completed todo never leaves that state,
        // and reaching it requires completeTodo (so a summary is attached).
        if (todo === undefined || todo.status === 'completed' || status === 'completed') return
        const timestamp = now()
        todo.status = status
        todo.updatedAt = timestamp
        if (status === 'in_progress' && todo.startedAt === undefined) todo.startedAt = timestamp
        if (todo.completedAt !== undefined) delete todo.completedAt
      },
      completeTodo: (draft, input) => {
        const todo = findTodo(draft, input.todoId)
        // First completion wins: replaying a recorded completion or a later
        // re-completion never rewrites a terminal record.
        if (todo === undefined || todo.status === 'completed') return
        const completedAt = input.completedAt
        todo.status = 'completed'
        todo.completedAt = completedAt
        todo.updatedAt = completedAt
        todo.completion = {
          summary: input.summary,
          implementationPath: input.implementationPath,
          changedFiles: input.changedFiles,
          verification: input.verification,
          completedAt,
          completedBy: input.completedBy,
        }
      },
      removeTodo: (draft, todoId) => {
        for (const project of draft.projects) {
          const index = project.todos.findIndex(todo => todo.id === todoId)
          // A completed todo is a terminal record: it is never deleted.
          if (index === -1) continue
          const todo = project.todos[index]
          if (todo === undefined || todo.status === 'completed') continue
          project.todos.splice(index, 1)
        }
      },
    },
  })
}
