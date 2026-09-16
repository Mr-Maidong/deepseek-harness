/**
 * `workbench_complete` records ONE whole-task completion per work item. The tool
 * reads the calling Session's own `studioTodoCompletions` projection before it
 * appends, so a replacement that drops a recorded file path or verification
 * command is refused with the model-facing reason and leaves the log untouched,
 * while a replacement that keeps them supersedes the earlier record and tells
 * the model to fold the whole task into the summary.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'

import * as tool from '../src/index.ts'

const testToolSignal = new AbortController().signal

/** The completion one call submits, without the fields the tool fills in. */
type CompletionArgs = {
  todoId: string
  summary: string
  implementationPath: string[]
  changedFiles: { path: string; purpose: string }[]
  verification: { command: string; result: 'passed' | 'failed' | 'skipped'; note?: string }[]
}

/** A parent Agent backed by a real Session — the tool reads `agent.session`. */
function agentWithSession(id: string): Agent & { session: Session } {
  const session = Session.create(SessionId(id))
  return { id: SessionId(id), session } as unknown as Agent & { session: Session }
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(tool, { allowParallelInProgress: true })
  return ctx
}

let callCounter = 0
function callComplete(ctx: Context, args: unknown, over: { agent?: Agent | undefined } = {}) {
  const agent = 'agent' in over ? over.agent : agentWithSession(`complete-${++callCounter}`)
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId(`complete-${++callCounter}`),
    name: 'workbench_complete',
    arguments: args,
    ...agent ? { agent } : {},
  })
}

/** A whole-task record; overrides stand in for a later, narrower submission. */
function completion(over: Partial<Omit<CompletionArgs, 'todoId'>> = {}): Omit<CompletionArgs, 'todoId'> {
  return {
    summary: 'Shipped the whole task.',
    implementationPath: ['Wrote the code.', 'Ran the checks.'],
    changedFiles: [{ path: 'packages/a/src/a.ts', purpose: 'The change.' }],
    verification: [{ command: 'npx vitest run packages/a', result: 'passed' }],
    ...over,
  }
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

function recordedCount(session: Session): number {
  return session.snapshotEvents().filter(event => event.type === 'studio/todo-complete').length
}

describe('workbench_complete', () => {
  it('records the whole-task completion on the calling session', async () => {
    const ctx = await setup()
    const agent = agentWithSession('first-call')
    const result = await callComplete(ctx, { todoId: '  todo-1  ', ...completion() }, { agent })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected a recorded completion')
    expect(result.value).toEqual({ todoId: 'todo-1', recorded: true, replaced: false })
    expect(text(result)).toBe('Recorded completion for todo todo-1.')
    const event = agent.session.snapshotEvents().findLast(entry => entry.type === 'studio/todo-complete')!
    expect(event.data.todoId).toBe('todo-1')
    expect(event.data.summary).toBe('Shipped the whole task.')
    expect(event.data.completedBy).toBe('model')
  })

  it('rejects a whitespace-only todoId', async () => {
    const ctx = await setup()
    const result = await callComplete(ctx, { todoId: '   ', ...completion() })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('non-empty todoId')
  })

  it('rejects a whitespace-only summary', async () => {
    const ctx = await setup()
    const result = await callComplete(ctx, { todoId: 'todo-1', ...completion({ summary: '  ' }) })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('non-empty summary')
  })

  it('rejects a non-agent caller (the record has no owning session)', async () => {
    const ctx = await setup()
    const result = await callComplete(ctx, { todoId: 'todo-1', ...completion() }, { agent: undefined })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('owning agent session')
  })

  it('supersedes the earlier record when every earlier file and command is kept', async () => {
    const ctx = await setup()
    const agent = agentWithSession('supersede')
    await callComplete(ctx, { todoId: 'todo-2', ...completion() }, { agent })
    const result = await callComplete(ctx, {
      todoId: 'todo-2',
      ...completion({
        summary: 'Shipped the whole task, including the later correction.',
        implementationPath: ['Wrote the code.', 'Ran the checks.', 'Closed the later gap.'],
        changedFiles: [
          { path: 'packages/a/src/a.ts', purpose: 'The change.' },
          { path: 'packages/a/src/b.ts', purpose: 'The later fix.' },
        ],
        verification: [
          { command: 'npx vitest run packages/a', result: 'passed' },
          { command: 'pnpm run test:gui', result: 'passed' },
        ],
      }),
    }, { agent })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected a recorded replacement')
    // The returned record names the superseded completion by its own time: the
    // value is the wire result, so it is compared whole rather than accessed.
    const superseded = agent.session.snapshotEvents().find(entry => entry.type === 'studio/todo-complete')!
    expect(result.value).toEqual({
      todoId: 'todo-2',
      recorded: true,
      replaced: true,
      replacedAt: superseded.data.completedAt,
      replacedSummary: 'Shipped the whole task.',
    })
    const rendered = text(result)
    expect(rendered).toContain('replacing the record written at')
    expect(rendered).toContain('call workbench_complete again with the complete record')
    expect(rendered).toContain('The replaced record said: Shipped the whole task.')
    expect(recordedCount(agent.session)).toBe(2)
    // Last-wins on the wire: the projection exposes exactly the replacement.
    const projected = ctx.sessionProjections.snapshot(agent.session, ['studioTodoCompletions']).values.studioTodoCompletions!
    expect(projected['todo-2']!.summary).toBe('Shipped the whole task, including the later correction.')
  })

  it('refuses a replacement that drops a recorded file path and appends nothing', async () => {
    const ctx = await setup()
    const agent = agentWithSession('drop-file')
    await callComplete(ctx, { todoId: 'todo-3', ...completion() }, { agent })
    const result = await callComplete(ctx, {
      todoId: 'todo-3',
      ...completion({ changedFiles: [{ path: 'packages/a/src/b.ts', purpose: 'Only the latest file.' }] }),
    }, { agent })
    expect(result.isError).toBe(true)
    const refused = text(result)
    expect(refused).toContain('would drop entries')
    expect(refused).toContain('files packages/a/src/a.ts')
    expect(refused).toContain('The earlier record, written at')
    expect(refused).toContain('said: Shipped the whole task.')
    expect(recordedCount(agent.session)).toBe(1)
  })

  it('refuses a replacement that drops a recorded verification command', async () => {
    const ctx = await setup()
    const agent = agentWithSession('drop-command')
    await callComplete(ctx, { todoId: 'todo-4', ...completion() }, { agent })
    const result = await callComplete(ctx, {
      todoId: 'todo-4',
      ...completion({ verification: [{ command: 'pnpm run test:gui', result: 'passed' }] }),
    }, { agent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('commands npx vitest run packages/a')
    expect(recordedCount(agent.session)).toBe(1)
  })

  it('states the whole-task replacement contract in the registered schema', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(entry => entry.name === 'workbench_complete')!
    expect(schema.description).toContain('replaces the earlier record')
    const parameters = schema.parameters as { properties?: Record<string, { description?: string }> }
    expect(parameters.properties?.summary?.description).toBe('Complete result summary for the whole task, not only the latest change.')
    expect(parameters.properties?.changedFiles?.description).toBe('Every file the task changed; a later call keeps the earlier entries.')
  })

  it('presents the call with a stable title and the submitted record as raw input', async () => {
    const ctx = await setup()
    const def = ctx.tools.get('workbench_complete')!
    const args = { todoId: 'todo-1', ...completion() }
    expect(def.presentCall?.(args)).toEqual({ card: 'generic', title: 'Write Lingguang completion', kind: 'other', rawInput: args })
  })
})
