# Agent Note: MCP reconnect past the attempt budget

Status: implemented

English | [中文](2026-10-02-mcp-reconnect-past-the-budget.zh.md)

## Problem

Two connection losses left an MCP server unusable until a plugin reload or Host restart. After `maxAttempts` consecutive failures the supervisor stopped reconnecting and unregistered the server's tools, so a local server that crashed and later came back was never picked up again. A Streamable HTTP session the server dropped keeps its transport object open and reports the loss only through the MCP client's error callback, which the supervisor ignored, so a dead server kept its tools registered and every call failed for as long as the process lived. A third case ran the other way: a stdio child whose transport never confirmed closure made the supervisor stop reconnecting and log an instruction to reload, which traded one stuck process for a permanently unusable server.

## Decision

The client's `onerror` joins `onclose` as a loss signal. One loss decision belongs to each generation: the handler acts only for an established generation (`attemptSettled` and a recorded `connectedAt`), collapses repeated reports into a single reconnect, and leaves a connect-time report to the attempt's own failure path. Stdio keeps arriving through close, while an HTTP session now has a path that does not wait for a signal its transport never sends.

Exhausting the attempt budget withdraws the server's tools once and keeps probing at `maxDelayMs` instead of stopping. The withdrawal is enqueued on the same sync chain that serializes every registration swap, so it cannot race an in-flight re-sync, and a later successful generation clears both the withdrawal and the attempt counter, which re-registers the tools. Because the budget no longer ends the outage, a returned server is usable without operator action; the log line states that retries continue at the ceiling.

A generation whose closure the transport never confirms becomes the retry loop's owner. Its close barrier is stored as `stuckClose`, and each scheduled outage tick re-checks that barrier before creating a replacement; while the barrier still reports the transport alive, the tick takes the next delay instead of a new connection. Disposal closes through the same barrier, so a server process that outlived its transport is never overlapped by a replacement and is still closed on unload. Closing a generation first releases the Streamable HTTP session it opened ([session release note](2026-10-02-mcp-http-session-release.md)).

Disposal now ends the loop where it should: `scheduleReconnect` arms no timer once disposed, and `connectGeneration` refuses to create a generation afterwards, so a tick that survives an unload opens nothing that nothing would close.

## Alternatives considered

**Keep stopping at the budget and tell the operator to reload.** This was the shipped behavior. It assumes a human notices the log line and that the server's failure was permanent, which is wrong for the common local-server crash: the process returns, and only an unrelated reload restores its tools.

**Detect a dead HTTP session by probing it.** A periodic request would add traffic, need its own timeout policy, and blur request-level retry with connection ownership. The MCP SDK already surfaces a transport failure on the affected requests, which is the signal the supervisor now consumes. A connection that accepts requests but never answers therefore stays undetected; the [package README](../../../../packages/mcp/mcp-client/README.md) records that as a limit rather than a promise.

**Reconnect on every error report.** One outage reports several failures — one per failed request and per SSE retry — and each would start a generation. The per-generation single-loss guard keeps one owner per outage.

**Drop the stuck-close barrier and force a replacement.** A replacement would launch a second server process beside one the transport never confirmed dead, which is the overlap the barrier exists to prevent.

## Consequences

An exhausted outage now costs one probe per `maxDelayMs` for as long as it lasts; the timer stays unref'd, so a probe never holds the process open by itself. A server that never returns keeps no tools registered, and the log line that used to request a reload now reports the ceiling delay. Loss detection depends on the SDK reporting a transport failure, so a silently stalled connection is still not detected.

Verification: `packages/mcp/mcp-client/tests/reconnect.spec.ts` covers the error-reported loss for an established HTTP generation, the continued probing and single tool withdrawal at the cap, the unconfirmed-close barrier deferring a replacement, and disposal while a barrier-owning tick is pending. `packages/mcp/mcp-client/tests/negotiation-lifecycle.spec.ts` covers recovery from a transport error report without a close signal and the deferred replacement. The current reconnect policy they verify is described in the [MCP client plugin note](../feature/2026-07-07-mcp-client-plugin.md) and the [package README](../../../../packages/mcp/mcp-client/README.md).
