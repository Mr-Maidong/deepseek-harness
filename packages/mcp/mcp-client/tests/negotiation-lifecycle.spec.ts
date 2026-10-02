import { z } from 'zod'
/** Real SDK probe ownership, failed negotiation recovery, established-session recovery, and subprocess quiescence. */

import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { StreamableHTTPClientTransport, type Transport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { createMcpHandler, McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import { toNodeHandler, type NodeIncomingMessageLike } from '@modelcontextprotocol/node'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { startConnection, resolveReconnectPolicy } from '../src/connection.ts'
import type { Config } from '../src/index.ts'

const { mockTransport } = vi.hoisted(() => ({ mockTransport: vi.fn<() => Transport>() }))
vi.mock('../src/transport.ts', () => ({ createTransport: mockTransport, terminateSession: async () => {} }))

const config: Config = {
  transport: 'stdio', serverName: 'fixture', command: 'fixture', args: [], env: {}, cwd: '',
  toolCallTimeoutMs: 60_000, failOnStartupError: false,
}
const fixture = fileURLToPath(new URL('./fixtures/negotiation-lifecycle.mjs', import.meta.url))

async function connection(factory: () => Transport, retry: boolean) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const errors: string[] = []
  const warns: string[] = []
  const infos: string[] = []
  ctx.logger.error = (message: unknown) => { errors.push(String(message)) }
  ctx.logger.warn = (message: unknown) => { warns.push(String(message)) }
  ctx.logger.info = (message: unknown) => { infos.push(String(message)) }
  const transports: Transport[] = []
  mockTransport.mockImplementation(() => {
    const transport = factory()
    transports.push(transport)
    return transport
  })
  const handle = startConnection(ctx, config, resolveReconnectPolicy({
    // The ceiling stays far above the delays these probes use, so the retry the
    // exhausted budget schedules cannot fire inside a test window.
    enabled: retry, initialDelayMs: 1, maxDelayMs: 10_000, maxAttempts: 3,
  }, 'fixture'))
  onTestFinished(async () => {
    for (const transport of transports) await transport.close()
    await handle.dispose()
  })
  return { ...handle, ctx, errors, warns, infos, transports }
}

async function stdioFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-negotiation-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const eventsPath = join(root, 'events.jsonl')
  const releasePath = join(root, 'release')
  await writeFile(eventsPath, '')
  const events = async (): Promise<{ event: string; pid: number; previousAlive?: boolean }[]> => (await readFile(eventsPath, 'utf8'))
    .split('\n').filter(Boolean).map(line => JSON.parse(line) as { event: string; pid: number; previousAlive?: boolean })
  const handle = await connection(() => new StdioClientTransport({
    command: process.execPath, args: [fixture, eventsPath, releasePath], env: {},
  }), false)
  return { handle, events, release: () => writeFile(releasePath, '') }
}

/** A real HTTP MCP endpoint whose next requests fail until it is told to serve again. */
async function httpFixture() {
  let failures = 0
  const calls: string[] = []
  const handler = createMcpHandler(() => {
    const mcp = new McpServer(
      { name: 'http-fixture', version: '1.0.0' },
      { capabilities: { tools: {} } },
    )
    mcp.registerTool('ping', { description: 'Replies pong.', inputSchema: z.object({}) }, async (): Promise<CallToolResult> => {
      calls.push('ping')
      return { content: [{ type: 'text', text: 'pong' }] }
    })
    return mcp
  })
  const serve = toNodeHandler(handler)
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (failures > 0) {
      failures -= 1
      response.writeHead(503).end('temporary failure')
      return
    }
    // The adapter excludes explicit undefined on Node's optional HTTP fields.
    serve(request as NodeIncomingMessageLike, response).catch((error: unknown) => {
      response.writeHead(500).end(String(error))
    })
  })
  onTestFinished(async () => {
    await handler.close()
    server.closeAllConnections()
    const closed: PromiseWithResolvers<void> = Promise.withResolvers()
    server.close((error) => {
      if (error === undefined) closed.resolve()
      else closed.reject(error)
    })
    await closed.promise
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('HTTP fixture did not bind a TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    calls,
    failNext: () => { failures += 1 },
  }
}

describe('SDK negotiation lifecycle', () => {
  it('reaps the probe before starting the serving process', async () => {
    const { handle, events, release } = await stdioFixture()
    await release()
    expect(await handle.ready).toEqual({})
    const observed = await events()
    const starts = observed.filter(item => item.event === 'start')
    expect(starts).toHaveLength(2)
    expect(starts[1]!.previousAlive).toBe(false)
    await handle.dispose()
    for (const item of starts) expect(() => process.kill(item.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
  })

  it('disposes during a probe without starting or retaining a serving process', async () => {
    const { handle, events, release } = await stdioFixture()
    await vi.waitFor(async () => {
      expect((await events()).some(item => item.event === 'server/discover')).toBe(true)
    }, { timeout: 15_000 })
    const disposing = handle.dispose()
    await release()
    await disposing
    const starts = (await events()).filter(item => item.event === 'start')
    expect(starts).toHaveLength(1)
    for (const item of starts) expect(() => process.kill(item.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
    expect(handle.errors).toEqual([])
  })

  it('retries failed HTTP probes without waiting for a Client close event', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.writeHead(503)
      response.end('temporary failure')
    })
    onTestFinished(async () => {
      server.closeAllConnections()
      const closed: PromiseWithResolvers<void> = Promise.withResolvers()
      server.close((error) => {
        if (error) closed.reject(error)
        else closed.resolve()
      })
      await closed.promise
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('HTTP fixture did not bind a TCP address')
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`)
    const handle = await connection(() => new StreamableHTTPClientTransport(url), true)
    expect((await handle.ready).error).toBeDefined()
    expect(handle.errors).toEqual([])
    await vi.waitFor(() => { expect(handle.errors.some(line => line.includes('3 consecutive reconnect attempts failed — tools unregistered'))).toBe(true) })
    expect(requests).toBe(4)
    // Exhausting the budget does not stop the loop: the fourth retry drops to
    // the ceiling delay instead of doubling past it.
    expect(handle.warns.filter(line => line.includes('connection failed; retrying'))).toEqual([
      'mcp-client(fixture): connection failed; retrying in 1ms (attempt 1/3)',
      'mcp-client(fixture): connection failed; retrying in 2ms (attempt 2/3)',
      'mcp-client(fixture): connection failed; retrying in 4ms (attempt 3/3)',
      'mcp-client(fixture): connection failed; retrying in 10000ms (4 failed attempts)',
    ])
  })

  it('reconnects an established HTTP session after its transport reports a failure', async () => {
    const fixture = await httpFixture()
    const handle = await connection(() => new StreamableHTTPClientTransport(new URL(fixture.url)), true)
    expect(await handle.ready).toEqual({})
    const tool = 'mcp__fixture__ping'
    await vi.waitFor(() => { expect(handle.ctx.tools.get(tool)).toBeDefined() }, { timeout: 15_000 })
    // A healthy stateless session raises no loss signal, so the supervisor stays quiet.
    expect(handle.warns).toEqual([])

    // The session dies under an in-flight tool call. Streamable HTTP reports
    // this through the SDK error channel only; the Client close event never fires.
    fixture.failNext()
    const failed = await handle.ctx.tools.execute({
      name: tool, arguments: {}, callId: ToolCallId('ping-lost'), signal: new AbortController().signal,
    })
    expect(failed.isError).toBe(true)
    await vi.waitFor(() => {
      expect(handle.warns.filter(line => line.startsWith('mcp-client(fixture): connection lost; reconnecting')))
        .toEqual(['mcp-client(fixture): connection lost; reconnecting in 1ms (attempt 1/3)'])
    }, { timeout: 15_000 })
    await vi.waitFor(() => {
      expect(handle.infos).toContain('mcp-client(fixture): reconnected and re-synced tools (attempt 1/3)')
    }, { timeout: 15_000 })

    // The replacement generation serves the same tool from the same URL.
    const result = await handle.ctx.tools.execute({
      name: tool, arguments: {}, callId: ToolCallId('ping-after-http-loss'), signal: new AbortController().signal,
    })
    expect(result).toMatchObject({ isError: false, value: { content: [{ type: 'text', text: 'pong' }] } })
    expect(fixture.calls).toEqual(['ping'])
    expect(handle.transports).toHaveLength(2)
    expect(handle.errors).toEqual([])
  })

  it('retries failed stdio probes when no child could be spawned', async () => {
    const handle = await connection(() => new StdioClientTransport({
      command: join(fixture, 'missing-command'), env: {},
    }), true)
    expect((await handle.ready).error).toBeDefined()
    expect(handle.errors).toEqual([])
    await vi.waitFor(() => { expect(handle.errors.some(line => line.includes('3 consecutive reconnect attempts failed — tools unregistered'))).toBe(true) })
    expect(handle.transports).toHaveLength(4)
    expect(handle.warns.filter(line => line.includes('connection failed; retrying'))).toEqual([
      'mcp-client(fixture): connection failed; retrying in 1ms (attempt 1/3)',
      'mcp-client(fixture): connection failed; retrying in 2ms (attempt 2/3)',
      'mcp-client(fixture): connection failed; retrying in 4ms (attempt 3/3)',
      'mcp-client(fixture): connection failed; retrying in 10000ms (4 failed attempts)',
    ])
  })

  it('defers retries when a failed probe cannot confirm transport cleanup', async () => {
    const close = vi.fn()
      .mockRejectedValueOnce(new Error('SDK shutdown failed'))
      .mockRejectedValueOnce(new Error('supervisor shutdown failed'))
      .mockResolvedValue(undefined)
    const handle = await connection(() => ({
      start: () => Promise.reject(new Error('probe failed')),
      send: () => Promise.resolve(),
      close,
    }), true)
    expect((await handle.ready).error).toBeDefined()
    expect(handle.errors).toEqual([
      'mcp-client(fixture): failed generation could not confirm transport closure — reconnect deferred until the previous server process is gone',
    ])
    // The retry is scheduled but gated: without a reported closure it never
    // starts a replacement transport beside the unquiesced one.
    expect(handle.warns.some(line => line.includes('connection failed; retrying'))).toBe(true)
    expect(handle.transports).toHaveLength(1)
  })
})
