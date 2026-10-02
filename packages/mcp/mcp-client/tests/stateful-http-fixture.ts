/**
 * Stateful Streamable HTTP MCP fixture: the server keeps ONE session at a time
 * and frees it only when the client sends the session-terminating `DELETE`.
 *
 * This mirrors the server behavior that reports
 * `Already connected to a transport. Call close() before connecting to a new
 * transport, or use a separate Protocol instance per connection.` as an HTTP
 * 500: a server that binds one Protocol instance to the session it is serving
 * cannot accept a second handshake until the client releases the session it
 * abandoned. The stateless fixture in `http-fixture.ts` cannot express that —
 * it builds a fresh server per request and accepts any number of handshakes.
 *
 * Only the exchanges the client under test performs are implemented: the
 * legacy protocol probe, `initialize`, the initialized notification,
 * `tools/list`, and `tools/call`. `DELETE` releases the session; a server may
 * refuse that with `405`, which the MCP Streamable HTTP spec allows.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/** Body a stateful server returns when a handshake arrives while its session is still open. */
const BUSY_BODY = JSON.stringify({
  statusCode: 500,
  error: 'Internal Server Error',
  message: 'Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.',
})

/** One inbound JSON-RPC message, as far as this fixture reads it. */
interface InboundMessage {
  id?: string | number
  method?: string
  params?: { protocolVersion?: string }
}

/** Running stateful fixture and the session facts it observed. */
export interface StatefulHttpMcpFixture {
  url: string
  /** Session ids handed out, in order: one per accepted `initialize`. */
  issued: string[]
  /** `initialize` requests refused because the previous session was still open. */
  refusals: number
  /** Session ids an accepted `DELETE` released. */
  releases: string[]
  /** @returns the session currently open, or undefined while the fixture is free. */
  openSession: () => string | undefined
  /** Fail the next request that carries the session, as a session the server already dropped does. */
  failRequestOnce: () => void
  close: () => Promise<void>
}

/** What the fixture should answer a session-terminating `DELETE` with. */
export interface StatefulHttpMcpFixtureOptions {
  /** Status for `DELETE`; 405 is the spec's "this server does not terminate sessions" (default 200). */
  terminateStatus?: number
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    request.on('error', reject)
  })
}

function send(response: ServerResponse, status: number, body?: string, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(body)
}

/** Start a stateful MCP endpoint that serves one session at a time. */
export async function startStatefulHttpMcpFixture(
  options: StatefulHttpMcpFixtureOptions = {},
): Promise<StatefulHttpMcpFixture> {
  const terminateStatus = options.terminateStatus ?? 200
  const issued: string[] = []
  const releases: string[] = []
  let refusals = 0
  let open: string | undefined
  let failNextRequest = false

  function reply(message: InboundMessage): unknown {
    switch (message.method) {
      case 'tools/list':
        return { tools: [{ name: 'ping', description: 'Replies pong.', inputSchema: { type: 'object', properties: {} } }] }
      case 'tools/call':
        return { content: [{ type: 'text', text: 'pong' }] }
      default:
        return { code: -32601, message: 'Method not found' }
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readBody(request)
    const sessionId = request.headers['mcp-session-id']
    if (request.method === 'DELETE') {
      if (typeof sessionId !== 'string' || sessionId !== open) {
        send(response, 404, JSON.stringify({ message: 'unknown session' }))
        return
      }
      if (terminateStatus === 200) {
        open = undefined
        releases.push(sessionId)
      }
      send(response, terminateStatus)
      return
    }
    if (request.method !== 'POST') {
      send(response, 405, JSON.stringify({ message: 'method not allowed' }))
      return
    }
    const parsed: unknown = JSON.parse(body)
    const messages = (Array.isArray(parsed) ? parsed : [parsed]) as InboundMessage[]
    // The protocol probe precedes any session and never carries one.
    const probe = messages.find(message => message.method === 'server/discover')
    if (probe !== undefined) {
      send(response, 200, JSON.stringify({ jsonrpc: '2.0', id: probe.id, error: { code: -32601, message: 'Legacy server' } }))
      return
    }
    const handshake = messages.find(message => message.method === 'initialize')
    if (handshake !== undefined) {
      if (open !== undefined) {
        refusals += 1
        send(response, 500, BUSY_BODY)
        return
      }
      open = `session-${issued.length + 1}`
      issued.push(open)
      send(response, 200, JSON.stringify({
        jsonrpc: '2.0',
        id: handshake.id,
        result: {
          protocolVersion: handshake.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'stateful-http-fixture', version: '1.0.0' },
        },
      }), { 'mcp-session-id': open })
      return
    }
    if (typeof sessionId !== 'string' || sessionId !== open) {
      send(response, 404, JSON.stringify({ message: 'no such session' }))
      return
    }
    if (failNextRequest) {
      failNextRequest = false
      send(response, 500, JSON.stringify({ statusCode: 500, message: 'session is gone' }))
      return
    }
    const answers = messages.filter(message => message.id !== undefined).map(message => ({
      jsonrpc: '2.0',
      id: message.id,
      ...(() => {
        const payload = reply(message)
        return 'code' in (payload as object) ? { error: payload } : { result: payload }
      })(),
    }))
    // A notification-only POST answers an empty 200, which keeps the client's
    // notification path free of the SSE stream a 202 would open.
    send(response, 200, answers.length === 0 ? undefined : JSON.stringify(answers.length === 1 ? answers[0] : answers))
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) send(response, 500, JSON.stringify({ message: String(error) }))
    })
  })
  const listening: PromiseWithResolvers<void> = Promise.withResolvers()
  server.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('stateful HTTP fixture has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    issued,
    get refusals(): number { return refusals },
    releases,
    openSession: () => open,
    failRequestOnce: () => { failNextRequest = true },
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    },
  }
}
