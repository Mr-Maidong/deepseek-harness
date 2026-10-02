/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
 */

import type { Transport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { Config } from './index.ts'

/**
 * The subprocess seam's scrubbed parent env (credential-shaped and stale
 * `DSH_*` names dropped), plus the spec's explicit env. The MCP SDK owns the
 * actual spawn, so this transport shares the scrub definition rather than the
 * spawn path.
 */
function buildChildEnv(extra: Record<string, string>): Record<string, string> {
  return { ...scrubbedParentEnv(), ...extra }
}

/**
 * End the server-side session a transport opened, when it opened one.
 *
 * A Streamable HTTP session outlives the client that started it: the SDK's
 * transport `close()` aborts in-flight requests and fires `onclose`, and
 * releases the session only through this separate operation. A server that
 * binds one Protocol instance to the session it serves therefore keeps
 * refusing the next handshake — as an HTTP 500 reporting that it is already
 * connected to a transport — until the release arrives, which is what makes an
 * entry that was disabled and re-enabled unusable. Stdio and in-memory
 * transports own no session and return here.
 *
 * @param transport - transport a connection generation was built on; absent
 * when the attempt failed before building one, which leaves nothing to release.
 * @throws Whatever the terminating request failed with, for the caller to
 * report. The SDK already accepts `405 Method Not Allowed` as a server that
 * does not terminate sessions.
 */
export async function terminateSession(transport: Transport | undefined): Promise<void> {
  if (!(transport instanceof StreamableHTTPClientTransport)) return
  await transport.terminateSession()
}

/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
export function createTransport(config: Config): Transport {
  switch (config.transport) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: buildChildEnv(config.env),
        cwd: config.cwd,
      })
    case 'streamable-http':
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        { requestInit: { headers: config.headers } },
      )
  }
}
