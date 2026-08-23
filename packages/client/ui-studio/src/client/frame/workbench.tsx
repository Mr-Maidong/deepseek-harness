import { useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '../left-panel/locales.ts'
import css from './Workbench.module.css'

/** Workbench data injected by the studio shell. */
export interface StudioWorkbenchInjected {
  sendToChat: (message: string) => Promise<void>
}

/** Right-rail workbench props. */
export type StudioWorkbenchProps = PropsRuntime<'studio.workbench'> & PropsLocale<typeof NS> & StudioWorkbenchInjected

type ProjectTodo = { id: string; title: string; detail: string; done: boolean }
type ProjectBoard = { id: string; title: string; todos: ProjectTodo[] }

/** Render the project todo workbench in Studio's right rail. */
export function StudioWorkbench(props: StudioWorkbenchProps): React.ReactElement {
  const { t, sendToChat } = props
  const [projects, setProjects] = useState<ProjectBoard[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDraftOpen, setProjectDraftOpen] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState<string>()
  const [editingDetail, setEditingDetail] = useState('')
  const [error, setError] = useState<string | undefined>()

  const activeProject = useMemo(
    () => projects.find(project => project.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  )

  const addTodo = (): void => {
    const title = draftTitle.trim()
    if (title === '' || activeProject === undefined) return
    setProjects(previous => previous.map(project => project.id === activeProject.id
      ? {
        ...project,
        todos: [...project.todos, { id: `${Date.now()}`, title, detail: t('workbench.todoDefaultDetail'), done: false }],
      }
      : project))
    setDraftTitle('')
  }

  const addProject = (): void => {
    const title = projectTitle.trim()
    if (title === '') return
    const project = { id: `${Date.now()}`, title, todos: [] }
    setProjects(previous => [...previous, project])
    setActiveProjectId(project.id)
    setProjectTitle('')
    setProjectDraftOpen(false)
  }

  const toggleTodo = (todoId: string): void => {
    if (activeProject === undefined) return
    setProjects(previous => previous.map(project => project.id === activeProject.id
      ? { ...project, todos: project.todos.map(item => item.id === todoId ? { ...item, done: !item.done } : item) }
      : project))
  }

  const removeProject = (): void => {
    if (activeProject === undefined || projects.length <= 1) return
    const next = projects.filter(project => project.id !== activeProject.id)
    setProjects(next)
    setActiveProjectId(next[0]?.id ?? '')
  }

  const removeTodo = (todoId: string): void => {
    if (activeProject === undefined) return
    setProjects(previous => previous.map(project => project.id === activeProject.id
      ? { ...project, todos: project.todos.filter(todo => todo.id !== todoId) }
      : project))
    if (editingTodoId === todoId) {
      setEditingTodoId(undefined)
      setEditingDetail('')
    }
  }

  const startEditingDetail = (todo: ProjectTodo): void => {
    setEditingTodoId(todo.id)
    setEditingDetail(todo.detail)
    setError(undefined)
  }

  const cancelEditingDetail = (): void => {
    setEditingTodoId(undefined)
    setEditingDetail('')
  }

  const saveEditingDetail = (): void => {
    if (activeProject === undefined || editingTodoId === undefined) return
    const detail = editingDetail.trim() || t('workbench.todoDefaultDetail')
    setProjects(previous => previous.map(project => project.id === activeProject.id
      ? { ...project, todos: project.todos.map(todo => todo.id === editingTodoId ? { ...todo, detail } : todo) }
      : project))
    cancelEditingDetail()
  }

  const sendTodo = async (todo: ProjectTodo): Promise<void> => {
    setError(undefined)
    try {
      await sendToChat(`${todo.title}\n${todo.detail}`)
    } catch {
      setError(t('workbench.sendFailed'))
    }
  }

  const sendProject = async (): Promise<void> => {
    if (activeProject === undefined || activeProject.todos.length === 0) return
    setError(undefined)
    try {
      await sendToChat(activeProject.todos
        .map(todo => `- ${todo.title}\n  ${todo.detail}`)
        .join('\n'))
    } catch {
      setError(t('workbench.sendFailed'))
    }
  }

  return <section className={css.workbench} aria-labelledby="studio-workbench-title">
    <header className={css.header}>
      <div>
        <h2 id="studio-workbench-title"><span className={css.titleIcon} aria-hidden="true" /><span className={css.titleText}>{t('workbench.title')}</span></h2>
        <p className={css.subtitle}>{t('workbench.subtitle')}</p>
      </div>
    </header>

    <div className={css.projectBar}>
      <div className={css.projectTabs} role="tablist" aria-label="项目列表">
        {projects.map(project => <button
          className={css.projectTab}
          key={project.id}
          type="button"
          role="tab"
          aria-selected={project.id === activeProject?.id}
          onClick={() => { setActiveProjectId(project.id); cancelEditingDetail(); setError(undefined) }}
        >{project.title}</button>)}
      </div>
      <div className={css.projectActions}>
        <button
          className={css.iconButton}
          type="button"
          aria-label={t('workbench.addProject')}
          title={t('workbench.addProject')}
          onClick={() => { setProjectDraftOpen(open => !open); setProjectTitle('') }}
        >
          <span className={css.newIcon} aria-hidden="true" />
        </button>
        <button
          className={css.quietButton}
          type="button"
          disabled={activeProject?.todos.length === 0}
          aria-label={t('workbench.sendAll')}
          title={t('workbench.sendAll')}
          onClick={() => { void sendProject() }}
        >
          <span className={css.sendIcon} aria-hidden="true" />
        </button>
        <button
          className={css.quietButton}
          type="button"
          disabled={projects.length <= 1}
          aria-label="移除项目"
          title="移除项目"
          onClick={removeProject}
        >
          <span className={css.deleteIcon} aria-hidden="true" />
        </button>
      </div>
    </div>

    {projectDraftOpen && <form className={css.inlineForm} onSubmit={(event) => { event.preventDefault(); addProject() }}>
      <input value={projectTitle} onChange={(event) => { setProjectTitle(event.target.value) }} placeholder={t('workbench.projectPrompt')} aria-label={t('workbench.projectPrompt')} autoFocus />
      <button className={css.textButton} type="submit" disabled={projectTitle.trim() === ''}>{t('workbench.addProject')}</button>
    </form>}

    {activeProject === undefined && <p className={css.empty}>{t('workbench.empty')}</p>}
    {activeProject !== undefined && <>
      <div className={css.todoList}>
        {activeProject.todos.length === 0 && <p className={css.empty}>{t('workbench.empty')}</p>}
        {activeProject.todos.map(todo => <article className={css.todoCard} key={todo.id} data-done={todo.done || undefined}>
          <div className={css.todoCardHead}>
            <label className={css.todoTitleRow}>
              <input
                className={css.todoCheckbox}
                type="checkbox"
                checked={todo.done}
                onChange={() => { toggleTodo(todo.id) }}
                aria-label={todo.done ? '标记为未完成' : '标记为已完成'}
              />
              <span className={css.todoTitle}>{todo.title}</span>
            </label>
            <div className={css.todoActions}>
              <button
                className={css.todoSend}
                type="button"
                aria-label={t('workbench.sendOne')}
                title={t('workbench.sendOne')}
                onClick={() => { void sendTodo(todo) }}
              >
                <span className={css.sendIcon} aria-hidden="true" />
              </button>
              <button
                className={css.todoDelete}
                type="button"
                aria-label={t('workbench.removeTodo')}
                title={t('workbench.removeTodo')}
                onClick={() => { removeTodo(todo.id) }}
              >
                <span className={css.deleteIcon} aria-hidden="true" />
              </button>
            </div>
          </div>
          {editingTodoId === todo.id
            ? <div className={css.todoDetailEditor}>
              <textarea
                className={css.todoDetailInput}
                value={editingDetail}
                onChange={(event) => { setEditingDetail(event.target.value) }}
                aria-label={t('workbench.editDetail')}
                rows={3}
                autoFocus
              />
              <div className={css.todoDetailActions}>
                <button className={css.textButton} type="button" onClick={saveEditingDetail}>{t('workbench.saveDetail')}</button>
                <button className={css.quietTextButton} type="button" onClick={cancelEditingDetail}>{t('workbench.cancelEdit')}</button>
              </div>
            </div>
            : <button
              className={css.todoDetail}
              type="button"
              onClick={() => { startEditingDetail(todo) }}
              aria-label={t('workbench.editDetail')}
              title={t('workbench.editDetail')}
            >{todo.detail}</button>}
        </article>)}
      </div>
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <form className={css.todoForm} onSubmit={(event) => { event.preventDefault(); addTodo() }}>
        <input value={draftTitle} onChange={(event) => { setDraftTitle(event.target.value) }} placeholder={t('workbench.addTodo')} aria-label={t('workbench.addTodo')} />
        <button className={css.sendDraft} type="submit" disabled={draftTitle.trim() === ''} aria-label={t('workbench.addTodo')} title={t('workbench.addTodo')}><span className={css.sendIcon} aria-hidden="true" /></button>
      </form>
    </>}
  </section>
}
