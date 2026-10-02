# Agent Note: MCP HTTP session release on connection abandonment

Status: implemented

English | [中文](2026-10-02-mcp-http-session-release.zh.md)

## Problem

A stateful Streamable HTTP server the user configured accepted the first connection, and after the configuration entry was disabled and re-enabled every attempt failed with HTTP 500 `Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.` The client reported the response body verbatim, so the entry's error was that server text rather than a diagnosable connection failure.

The plugin never released the session it opened, and the MCP SDK does not release one on its own: the transport's `close()` aborts in-flight requests and fires `onclose`, while ending the server-side session is the separate `terminateSession()` operation the spec defines as an HTTP `DELETE` carrying the session header. A server that serves one session at a time binds a single Protocol instance to the session it is serving and refuses the next handshake until that session ends. The supervisor closed every abandoned generation — on disposal, on a replacement connection, and on a failed attempt — so every one of those paths leaked the session it had opened.

## Decision

Closing a generation releases the server session it opened before closing the transport. The order is required rather than stylistic: the terminating request carries the same abort signal that `close()` aborts, so a release after the close would fail on every path. The SDK clears its session id when the release succeeds, which makes the repeated closes of the stuck-close barrier no-ops instead of repeated requests.

The transport module owns this transport-specific knowledge through one exported `terminateSession(transport)`, which acts only on a Streamable HTTP transport and returns for stdio, for in-memory transports, and for an attempt that failed before building a transport. The supervisor calls it from the single function that closes a generation, so no second close path can skip it.

The release is best-effort. The SDK already accepts `405 Method Not Allowed` as a server that does not terminate sessions, and any other failure is logged as `could not release the server session` and does not fail disposal. Every caller reaches that close with the generation's loss signals already disarmed — disposal, a settled attempt, or one handled loss — so a refused release cannot start a reconnect loop, and the fix needed no new lifecycle state.

## Alternatives considered

**Leave the session to the server's own expiry.** This was the shipped behavior. It assumes the server eventually drops an idle session, which the reported server did not: the entry stayed unusable until the server process restarted, and the failure looked like a server-side bug.

**Release after closing the transport.** `close()` aborts the controller whose signal the release request passes, so the release would be aborted instead of sent on every path.

**Send the `DELETE` from the supervisor instead of calling the SDK operation.** That would duplicate the SDK's header and protocol-version handling, its `405` tolerance, and its session-id bookkeeping, and would couple the supervisor to one transport's wire format.

**Track whether a generation was already released.** The SDK clears its session id on success, so a repeated release is already a no-op; a second flag would need an independent owner for a fact the transport already holds.

**Fail disposal when the release fails.** A server that refuses termination is outside the client's authority, and unload must still complete. The warning keeps the leak visible in the log instead of hiding it behind a failed unload.

## Consequences

An entry that is disabled and re-enabled reconnects against a server that serves one session at a time, and a reconnect that replaces a generation frees the server session the previous one held, so such a server survives an outage. A server that refuses termination keeps the abandoned session until it expires itself; the plugin logs that release failure and continues, so the next handshake may still be refused and restarting the server clears it.

Verification: `packages/mcp/mcp-client/tests/http-session.spec.ts` runs a stateful fixture that serves one session at a time and reproduces the reported 500 body, covering the release observed on disposal, a replacement connection that reaches `connected` with its tools and a working call, the release a failed generation performs before its reconnect, a `405` refusal that stays quiet, and a failed release reported as a warning without failing disposal. `packages/mcp/mcp-client/tests/mcp-client.spec.ts` covers `terminateSession` for a transport that owns no session, a session transport that never received a session, and a failed attempt with no transport. The close and loss ownership this builds on is described in the [reconnect Agent Note](2026-10-02-mcp-reconnect-past-the-budget.md) and the [package README](../../../../packages/mcp/mcp-client/README.md).
