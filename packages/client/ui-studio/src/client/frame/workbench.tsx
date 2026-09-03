import { useEffect, useMemo, useState } from 'react'
import { MarkdownText, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchTodoCompletion } from '@deepseek-ai/dsh-tool-todo/client'
import { NS } from '../left-panel/locales.ts'
import type { createProjectTodoStore, ProjectTodo, TodoCompletionInput } from './project-todo-store.ts'
import css from './Workbench.module.css'

/** Business operations supplied by the studio shell. */
export interface StudioWorkbenchInjected {
  sendToChat: (message: string) => Promise<void>
}

/** Right-rail workbench props. */
export type StudioWorkbenchProps = PropsRuntime<'studio.workbench'>
  & PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createProjectTodoStore>>
  & StudioWorkbenchInjected

/** Default labels for todo Markdown summaries. */
const MARKDOWN_LABELS = {
  code: { copyLabel: 'Copy', copiedLabel: 'Copied' },
  footnotes: 'Footnotes',
} as const

/** Card footer label: bucket words from this namespace, wrapped in the update template. */
function updatedLabel(updatedAt: string, now: number, t: StudioWorkbenchProps['t']): string {
  const { unit, n } = relativeTime(Date.parse(updatedAt), now)
  if (unit === 'now') return t('workbench.updatedNow')
  return t('workbench.updatedAgo', { t: t(`time.${unit}`, { n }) })
}

/**
 * Fold model-written completions from the bound session's projection into the
 * workspace todo store. Completions live durably in the workspace store; the
 * session projection is only the channel that carries the model's
 * `workbench_complete` result to this client. The store ignores completion of
 * an already-completed todo, so replaying the same projection (mount under a
 * session whose baseline already carries it, or a later duplicate event) is
 * harmless. Runs on every projection change, including the initial mount.
 */
function reconcileCompletions(
  projected: Record<string, WorkbenchTodoCompletion> | null | undefined,
  completeTodo: (input: TodoCompletionInput) => void,
): void {
  if (projected === undefined || projected === null) return
  // WorkbenchTodoCompletion is structurally a TodoCompletionInput
  // (todoId + completedBy: 'model'), so the projection value folds as-is.
  for (const completion of Object.values(projected)) {
    completeTodo(completion)
  }
}

/** Render the workspace-shared project todo workbench. */
export function StudioWorkbench(props: StudioWorkbenchProps): React.ReactElement {
  const { t, sendToChat, sessionId, actions } = props
  const projects = props.useStore(state => state.projects)
  const projectedCompletions = props.useProjection('studioTodoCompletions')
  const [activeProjectId, setActiveProjectId] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDraftOpen, setProjectDraftOpen] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState<string>()
  const [editingDetail, setEditingDetail] = useState('')
  // Uncompleted todos default to expanded; completed todos default to collapsed.
  const [collapsedTodoIds, setCollapsedTodoIds] = useState<ReadonlySet<string>>(new Set())
  const [expandedTodoIds, setExpandedTodoIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string>()

  // The projection is a write-through channel: fold each model completion into
  // the workspace store once it is seen (mount baseline or live event).
  useEffect(() => {
    reconcileCompletions(projectedCompletions, actions.completeTodo)
  }, [projectedCompletions, actions])

  // Card footers date each todo with relative time; the tick refreshes the
  // buckets while the panel stays mounted.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, 30_000)
    return () => { clearInterval(timer) }
  }, [])

  const activeProject = useMemo(
    () => projects.find(project => project.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  )

  const addTodo = (): void => {
    const title = draftTitle.trim()
    if (title === '' || activeProject === undefined) return
    actions.addTodo({ projectId: activeProject.id, title, detail: '', sourceSessionId: sessionId })
    setDraftTitle('')
  }

  const addProject = (): void => {
    const title = projectTitle.trim()
    if (title === '') return
    actions.addProject({ title })
    setProjectTitle('')
    setProjectDraftOpen(false)
  }

  const markDone = (todo: ProjectTodo): void => {
    // Completion is terminal: checking an uncompleted todo freezes it with no
    // model summary; a completed todo's checkbox is disabled and never toggles.
    if (todo.status === 'completed') return
    const completedAt = new Date().toISOString()
    actions.completeTodo({
      todoId: todo.id,
      summary: '',
      implementationPath: [],
      changedFiles: [],
      verification: [],
      completedAt,
      completedBy: 'user',
    })
  }

  const removeProject = (): void => {
    if (activeProject === undefined) return
    const next = projects.find(project => project.id !== activeProject.id)
    actions.removeProject(activeProject.id)
    setActiveProjectId(next?.id ?? '')
  }

  const removeTodo = (todoId: string): void => {
    actions.removeTodo(todoId)
    if (editingTodoId === todoId) {
      setEditingTodoId(undefined)
      setEditingDetail('')
    }
  }

  const startEditingDetail = (todo: ProjectTodo): void => {
    if (todo.status === 'completed') return
    setEditingTodoId(todo.id)
    setEditingDetail(todo.detail)
    setError(undefined)
  }

  const cancelEditingDetail = (): void => {
    setEditingTodoId(undefined)
    setEditingDetail('')
  }

  const toggleDetail = (todo: ProjectTodo): void => {
    if (todo.status === 'completed') {
      setExpandedTodoIds((ids) => {
        const next = new Set(ids)
        if (next.has(todo.id)) next.delete(todo.id)
        else next.add(todo.id)
        return next
      })
    } else {
      setCollapsedTodoIds((ids) => {
        const next = new Set(ids)
        if (next.has(todo.id)) next.delete(todo.id)
        else next.add(todo.id)
        return next
      })
    }
  }

  // Completed todos default to collapsed; uncompleted ones default to expanded.
  const collapsedFor = (todo: ProjectTodo): boolean =>
    todo.status === 'completed' ? !expandedTodoIds.has(todo.id) : collapsedTodoIds.has(todo.id)

  const saveEditingDetail = (): void => {
    if (editingTodoId === undefined) return
    actions.updateTodoDetail(editingTodoId, editingDetail.trim())
    cancelEditingDetail()
  }

  const sendTodo = async (todo: ProjectTodo): Promise<void> => {
    if (todo.status === 'completed') return
    setError(undefined)
    actions.updateTodoStatus(todo.id, 'in_progress')
    try {
      await sendToChat('灵光任务（todoId: ' + todo.id + '）\n' + todo.title + '\n' + todo.detail)
    } catch {
      actions.updateTodoStatus(todo.id, 'blocked')
      setError(t('workbench.sendFailed'))
    }
  }

  const writeBackTodo = async (todo: ProjectTodo): Promise<void> => {
    if (todo.status === 'completed') return
    setError(undefined)
    try {
      await sendToChat('灵光任务（todoId: ' + todo.id + '）已执行。请调用 workbench_complete，将本次执行的整体方案、实现路径、修改文件与验证结果写回。不要重新执行任务。')
    } catch {
      setError(t('workbench.sendFailed'))
    }
  }

  const sendProject = async (): Promise<void> => {
    if (activeProject === undefined) return
    const pendingTodos = activeProject.todos.filter(todo => todo.status !== 'completed')
    if (pendingTodos.length === 0) return
    setError(undefined)
    for (const todo of pendingTodos) actions.updateTodoStatus(todo.id, 'in_progress')
    try {
      await sendToChat(pendingTodos.map(todo => '- (todoId: ' + todo.id + ') ' + todo.title + '\n  ' + todo.detail).join('\n'))
    } catch {
      for (const todo of pendingTodos) actions.updateTodoStatus(todo.id, 'blocked')
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
        {projects.map(project => <button className={css.projectTab} key={project.id} type="button" role="tab" aria-selected={project.id === activeProject?.id} onClick={() => { setActiveProjectId(project.id); cancelEditingDetail(); setError(undefined) }}>{project.title}</button>)}
      </div>
      <div className={css.projectActions}>
        <button className={css.iconButton} type="button" aria-label={t('workbench.addProject')} title={t('workbench.addProject')} onClick={() => { setProjectDraftOpen(open => !open); setProjectTitle('') }}><span className={css.newIcon} aria-hidden="true" /></button>
        <button className={css.quietButton} type="button" disabled={activeProject === undefined || !activeProject.todos.some(todo => todo.status !== 'completed')} aria-label={t('workbench.sendAll')} title={t('workbench.sendAll')} onClick={() => { void sendProject() }}><span className={css.sendIcon} aria-hidden="true" /></button>
        <button className={css.quietButton} type="button" disabled={activeProject === undefined} aria-label={t('workbench.removeProject')} title={t('workbench.removeProject')} onClick={removeProject}><span className={css.deleteIcon} aria-hidden="true" /></button>
      </div>
    </div>
    {projectDraftOpen && <form className={css.inlineForm} onSubmit={(event) => { event.preventDefault(); addProject() }}><input value={projectTitle} onChange={(event) => { setProjectTitle(event.target.value) }} placeholder={t('workbench.projectPrompt')} aria-label={t('workbench.projectPrompt')} autoFocus /><button className={css.textButton} type="submit" disabled={projectTitle.trim() === ''}>{t('workbench.addProject')}</button></form>}
    {activeProject === undefined && <div className={css.emptyState}><span className={css.emptyArtwork} aria-hidden="true" /></div>}
    {activeProject !== undefined && <>
      <div className={css.todoList}>
        {activeProject.todos.length === 0 && <div className={css.emptyState}><span className={css.emptyArtwork} aria-hidden="true" /></div>}
        {activeProject.todos.map(todo => <article className={css.todoCard} key={todo.id} data-done={todo.status === 'completed' || undefined}>
          <div className={css.todoCardHead}>
            <label className={css.todoTitleRow}><input className={css.todoCheckbox} type="checkbox" checked={todo.status === 'completed'} disabled={todo.status === 'completed'} onChange={() => { markDone(todo) }} aria-label={todo.status === 'completed' ? t('workbench.done') : t('workbench.markDone')} /><span className={css.todoTitle}>{todo.title}</span></label>
            <div className={css.todoActions}><button className={css.todoSend} type="button" disabled={todo.status === 'completed'} aria-label={t('workbench.sendOne')} title={t('workbench.sendOne')} onClick={() => { void sendTodo(todo) }}><span className={css.sendIcon} aria-hidden="true" /></button><button className={css.todoWriteBack} type="button" disabled={todo.status === 'completed' || todo.sourceSessionId !== sessionId} aria-label={t('workbench.writeBack')} title={t('workbench.writeBack')} onClick={() => { void writeBackTodo(todo) }}><span className={css.summaryIcon} aria-hidden="true" /></button><button className={css.todoDelete} type="button" disabled={todo.status === 'completed'} aria-label={t('workbench.removeTodo')} title={t('workbench.removeTodo')} onClick={() => { removeTodo(todo.id) }}><span className={css.deleteIcon} aria-hidden="true" /></button></div>
          </div>
          <div className={css.todoCardBody} data-collapsed={collapsedFor(todo) || undefined}>
            {editingTodoId === todo.id ? <div className={css.todoDetailEditor}><textarea className={css.todoDetailInput} value={editingDetail} onChange={(event) => { setEditingDetail(event.target.value) }} aria-label={t('workbench.editDetail')} rows={3} placeholder={t('workbench.todoDetailPrompt')} autoFocus /><div className={css.todoDetailActions}><button className={css.textButton} type="button" onClick={saveEditingDetail}>{t('workbench.saveDetail')}</button><button className={css.quietTextButton} type="button" onClick={cancelEditingDetail}>{t('workbench.cancelEdit')}</button></div></div> : <button className={css.todoDetail} type="button" onClick={() => { startEditingDetail(todo) }} disabled={todo.status === 'completed'} aria-label={t('workbench.editDetail')} title={t('workbench.editDetail')}>{todo.detail === '' ? t('workbench.todoDetailPrompt') : <MarkdownText text={todo.detail} labels={MARKDOWN_LABELS} />}</button>}
            {todo.completion?.summary !== undefined && todo.completion.summary !== '' && <>
              <div className={css.summaryDivider} role="separator" aria-label={t('workbench.summaryDivider')}><span>{t('workbench.summaryDivider')}</span></div>
              <div className={css.todoDetail} data-completion><MarkdownText text={todo.completion.summary} labels={MARKDOWN_LABELS} /></div>
            </>}
          </div>
          <div className={css.todoCardFoot}>
            <span className={css.todoUpdated}>{updatedLabel(todo.updatedAt, now, t)}</span>
            <button className={css.todoExpand} type="button" aria-expanded={!collapsedFor(todo)} aria-label={collapsedFor(todo) ? t('workbench.expandDetail') : t('workbench.collapseDetail')} title={collapsedFor(todo) ? t('workbench.expandDetail') : t('workbench.collapseDetail')} onClick={() => { toggleDetail(todo) }}><span className={collapsedFor(todo) ? css.expandIcon : css.collapseIcon} aria-hidden="true" /></button>
          </div>
        </article>)}
      </div>
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <form className={css.todoForm} onSubmit={(event) => { event.preventDefault(); addTodo() }}><input value={draftTitle} onChange={(event) => { setDraftTitle(event.target.value) }} placeholder={t('workbench.addTodo')} aria-label={t('workbench.addTodo')} /><button className={css.sendDraft} type="submit" disabled={draftTitle.trim() === ''} aria-label={t('workbench.addTodo')} title={t('workbench.addTodo')}><span className={css.sendIcon} aria-hidden="true" /></button></form>
    </>}
  </section>
}
