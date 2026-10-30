/**
 * Streamable HTTP session lifecycle: abandoning a connection must release the
 * server-side session it opened.
 *
 * The SDK's transport `close()` aborts in-flight requests and fires `onclose`;
 * releasing the session is a separate, explicitly-called operation. A server
 * that binds one Protocol instance to the session it serves therefore rejects
 * the next handshake until the client sends the terminating `DELETE` — the
 * failure an entry disabled and re-enabled (or any reconnect) hits as an HTTP
 * 500 "Already connected to a transport ...".
 */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { resolveReconnectPolicy, startConnection, type ConnectionHandle, type ReconnectConfig } from '../src/connection.ts'
import type { Config } from '../src/index.ts'
import { startStatefulHttpMcpFixture, type StatefulHttpMcpFixture } from './stateful-http-fixture.ts'

const testToolSignal = new AbortController().signal

/**
 * Run one tool call through the batch executor.
 * @param ctx - context whose tool registry dispatches the call.
 * @param name - registered tool name.
 * @param callId - identity recorded for the call.
 * @returns the call's settled result.
 */
async function settledCall(ctx: Context, name: string, callId: ToolCallId): Promise<ToolExecutionResult> {
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: callId, name, arguments: '{}' }],
    signal: testToolSignal,
  })
  const settled = batch.results[0]
  if (settled === undefined) throw new Error('the batch returned no result')
  return settled.result
}

/** One started supervisor and the context its tool registry lives on. */
interface Mounted {
  ctx: Context
  connection: ConnectionHandle
}

function httpConfig(url: string): Config {
  return {
    transport: 'streamable-http',
    serverName: 'stateful',
    url,
    headers: {},
    toolCallTimeoutMs: 15_000,
    failOnStartupError: false,
  }
}

/** Start a supervisor against the fixture; automatic retries stay off unless a case needs them. */
async function mount(fixture: StatefulHttpMcpFixture, reconnect: ReconnectConfig = { enabled: false }): Promise<Mounted> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  onTestFinished(() => ctx.fiber.dispose())
  const connection = startConnection(ctx, httpConfig(fixture.url), resolveReconnectPolicy(reconnect, 'stateful'))
  return { ctx, connection }
}

/** Capture the supervisor's own log lines, which never reach a test file's stdout. */
function captureLogs(ctx: Context): { warns: string[]; errors: string[] } {
  const warns: string[] = []
  const errors: string[] = []
  ctx.logger.warn = ((message: unknown) => { warns.push(String(message)) }) as typeof ctx.logger.warn
  ctx.logger.error = ((message: unknown) => { errors.push(String(message)) }) as typeof ctx.logger.error
  return { warns, errors }
}

/** Start a fixture whose server, like the reported one, serves one session at a time. */
async function startFixture(options?: { terminateStatus?: number }): Promise<StatefulHttpMcpFixture> {
  const fixture = await startStatefulHttpMcpFixture(options)
  onTestFinished(() => fixture.close())
  return fixture
}

describe('streamable HTTP sessions', () => {
  it('releases the session it abandons so a replacement connection is accepted', async () => {
    const fixture = await startFixture()
    const first = await mount(fixture)
    expect(await first.connection.ready).toEqual({})
    expect(first.connection.status()).toBe('connected')
    expect(first.connection.toolNames()).toEqual(['mcp__stateful__ping'])
    expect(fixture.openSession()).toBe('session-1')

    await first.connection.dispose()

    expect(fixture.releases).toEqual(['session-1'])
    expect(fixture.openSession()).toBeUndefined()

    const second = await mount(fixture)
    expect(await second.connection.ready).toEqual({})
    expect(fixture.refusals).toBe(0)
    expect(second.connection.status()).toBe('connected')
    expect(second.connection.toolNames()).toEqual(['mcp__stateful__ping'])

    const result = await settledCall(second.ctx, 'mcp__stateful__ping', ToolCallId('session-reuse-1'))
    expect(result.isError).toBe(false)
    expect(result.content).toContainEqual({ type: 'text', text: 'pong' })

    await second.connection.dispose()
    expect(fixture.releases).toEqual(['session-1', 'session-2'])
  })

  it('treats a refused termination (405) as released and stays quiet', async () => {
    const fixture = await startFixture({ terminateStatus: 405 })
    const mounted = await mount(fixture)
    const logs = captureLogs(mounted.ctx)
    expect(await mounted.connection.ready).toEqual({})

    await expect(mounted.connection.dispose()).resolves.toBeUndefined()

    expect(fixture.releases).toEqual([])
    expect(logs).toEqual({ warns: [], errors: [] })
  })

  it('releases the session of a failed generation before reconnecting', async () => {
    const fixture = await startFixture()
    const mounted = await mount(fixture, { enabled: true, initialDelayMs: 10, maxDelayMs: 20, maxAttempts: 5 })
    expect(await mounted.connection.ready).toEqual({})
    expect(fixture.openSession()).toBe('session-1')

    // One failed request is how a dead HTTP session reaches the supervisor: the
    // SDK reports the transport failure and the tool call fails with it.
    fixture.failRequestOnce()
    const failed = await settledCall(mounted.ctx, 'mcp__stateful__ping', ToolCallId('session-loss-1'))
    expect(failed.isError).toBe(true)

    await vi.waitFor(() => { expect(fixture.issued).toEqual(['session-1', 'session-2']) })
    expect(fixture.releases).toEqual(['session-1'])
    expect(fixture.refusals).toBe(0)
    expect(mounted.connection.status()).toBe('connected')
    expect(mounted.connection.toolNames()).toEqual(['mcp__stateful__ping'])
    expect(fixture.openSession()).toBe('session-2')

    const recovered = await settledCall(mounted.ctx, 'mcp__stateful__ping', ToolCallId('session-loss-2'))
    expect(recovered.isError).toBe(false)
    expect(recovered.content).toContainEqual({ type: 'text', text: 'pong' })
  })

  it('reports a failed termination without failing the disposal', async () => {
    const fixture = await startFixture({ terminateStatus: 500 })
    const mounted = await mount(fixture)
    const logs = captureLogs(mounted.ctx)
    expect(await mounted.connection.ready).toEqual({})

    await expect(mounted.connection.dispose()).resolves.toBeUndefined()

    expect(mounted.connection.status()).toBe('stopped')
    expect(logs.warns).toEqual(['mcp-client(stateful): could not release the server session: SdkHttpError: Failed to terminate session: Internal Server Error'])
    // The server kept the session: the leak is reported rather than hidden, and
    // the superseded session never becomes a second handshake.
    expect(fixture.openSession()).toBe('session-1')
    expect(fixture.issued).toEqual(['session-1'])
  })
})
