/**
 * Connection supervisor: owns the MCP client/transport generations for one
 * plugin instance, keeps the harness tool registry in sync with the live
 * generation, and — when the connection drops — restarts the configured
 * server with bounded exponential backoff.
 *
 * One outage shares one attempt budget (`maxAttempts` consecutive failed
 * attempts, delays doubling from `initialDelayMs` up to `maxDelayMs`). A
 * connection that stays up past the stability window closes the outage, so
 * the next disconnect starts a fresh budget while a crash-looping server —
 * even one whose connects briefly succeed — still exhausts the cap instead of
 * restarting at full speed. Exhaustion unregisters the server's tools and
 * spaces retries out to one per `maxDelayMs`; a server that returns later is
 * still picked up without a plugin reload or Host restart.
 *
 * Loss arrives as either transport signal: the close event (a stdio child
 * that exits) or the error report. An HTTP session that dies keeps its
 * transport object open and reports the loss only through the error path, so
 * a supervisor listening for close alone would keep a dead server's tools
 * registered forever.
 *
 * @module
 */

import { Client, type Transport } from '@modelcontextprotocol/client'
import type { Context } from '@deepseek-ai/cordis'
import { assertNever, type JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ServerContext } from './server-context.ts'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { createTransport, terminateSession } from './transport.ts'
import { syncTools } from './tools.ts'
import type { ToolBridgeOptions, ToolDisposers } from './tools.ts'
import type { Config } from './index.ts'

/** Live state of one MCP connection generation, as its supervisor reports it. */
export type McpConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'stopped'

/** Automatic reconnect policy for one MCP server connection. */
export interface ReconnectConfig {
  /** Reconnect automatically after a lost connection (default true). */
  enabled?: boolean
  /** First reconnect delay in milliseconds; doubles per consecutive failed attempt (default 500). */
  initialDelayMs?: number
  /** Backoff ceiling in milliseconds; also the uptime after which the attempt budget resets (default 30000). */
  maxDelayMs?: number
  /** Consecutive failed attempts per outage before the tools are unregistered and retries drop to one per `maxDelayMs` (default 10). */
  maxAttempts?: number
}

/** Defaults shared by the Config schema and {@link resolveReconnectPolicy}. */
export const RECONNECT_DEFAULTS: Required<ReconnectConfig> = Object.freeze({
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 10,
})

/** Default UTF-8 byte limit for attributed server instructions. */
export const DEFAULT_MAX_INSTRUCTION_BYTES = 32_768

// The SDK's stdio transport owns two two-second termination grace periods.
// Keep one additional second for the process-close event that proves the old
// generation is gone; timing out fails closed instead of overlapping children.
const GENERATION_CLOSE_TIMEOUT_MS = 5_000

/**
 * Readable text of a failure the SDK reported. Log lines keep `String(error)`
 * (they include the constructor prefix); the reported connection error carries
 * the message alone, because the settings page shows it as the server's state.
 * @param error - the value a failed attempt produced.
 * @returns the error's own message, or its text form.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Fully resolved reconnect policy captured at plugin load. */
export type ResolvedReconnectPolicy = Readonly<Required<ReconnectConfig>>

/**
 * The one explicit resolve step from raw reconnect config to the policy the
 * supervisor runs. Programmatic construction may bypass Schemastery
 * normalization, so every default and bound is re-judged here — misconfiguration
 * fails the plugin instance at load.
 *
 * @param config - Raw `reconnect` config; omission uses the defaults.
 * @param path - Diagnostic prefix naming the config location in thrown messages.
 * @returns The frozen resolved policy.
 */
export function resolveReconnectPolicy(config: ReconnectConfig | undefined, path: string): ResolvedReconnectPolicy {
  if (config !== undefined) {
    for (const key of Object.keys(config)) {
      if (!Object.hasOwn(RECONNECT_DEFAULTS, key)) throw new Error(`${path}.${key} is not a reconnect option`)
    }
  }
  const enabled = config?.enabled ?? RECONNECT_DEFAULTS.enabled
  const initialDelayMs = config?.initialDelayMs ?? RECONNECT_DEFAULTS.initialDelayMs
  const maxDelayMs = config?.maxDelayMs ?? RECONNECT_DEFAULTS.maxDelayMs
  const maxAttempts = config?.maxAttempts ?? RECONNECT_DEFAULTS.maxAttempts
  /* jscpd:ignore-start — domain-specific delay validation parallels llm retry-policy; not extractable */
  if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${path}.initialDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${path}.maxDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  if (initialDelayMs > maxDelayMs) {
    throw new Error(`${path}.initialDelayMs must be less than or equal to maxDelayMs`)
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`${path}.maxAttempts must be a positive integer`)
  }
  /* jscpd:ignore-end */
  return Object.freeze({ enabled, initialDelayMs, maxDelayMs, maxAttempts })
}

/** Result from the initial connection attempt, for startup-await semantics. */
export interface ConnectionOutcome {
  /** If the initial connection or tool sync failed, the error; otherwise absent. */
  error?: unknown
}

/** Handle for one plugin instance's supervised connection. */
export interface ConnectionHandle extends ServerContext {
  /**
   * Settles when the first connection attempt completes (success or failure).
   * The supervisor enters its reconnect loop regardless; the caller decides
   * whether a failed startup is fatal via `failOnStartupError`.
   */
  ready: Promise<ConnectionOutcome>
  /**
   * Stop reconnection, close the negotiating transport or live client, wait
   * for the in-flight attempt and queued tool syncs to quiesce, then
   * unregister every tool this server still owns.
   */
  dispose(): Promise<void>
  /**
   * Report the connection state for out-of-band observers. This reads the
   * supervisor's own state rather than the tool registry, so a server whose
   * tools were withdrawn after exhausting its retry budget still reports that
   * it is retrying.
   * @returns the state the supervisor is in right now.
   */
  status(): McpConnectionState
  /** @returns model-facing names of the tools the live generation registered, in registration order. */
  toolNames(): readonly string[]
  /** @returns the most recent failed attempt's message, or undefined while no attempt has failed since the last success. */
  error(): string | undefined
}

/**
 * Start the supervised connection for one MCP server and keep it alive per
 * the reconnect policy.
 *
 * @param ctx - Cordis context providing the `tools` registry and logger.
 * @param config - Resolved plugin config selecting the transport and server identity.
 * @param policy - Resolved reconnect policy from {@link resolveReconnectPolicy}.
 * @returns Handle with a `ready` promise for startup-await and a `dispose` for teardown.
 */
export function startConnection(ctx: Context, config: Config, policy: ResolvedReconnectPolicy): ConnectionHandle {
  const label = `mcp-client(${config.serverName})`
  const incompleteDisposalMessage = `${label}: transport closure could not be confirmed during disposal — server shutdown may be incomplete`
  const opts: ToolBridgeOptions = {
    registrationFailure: 'contain',
    serverName: config.serverName,
    toolCallTimeoutMs: config.toolCallTimeoutMs,
  }
  // The initial sync uses 'throw' when failOnStartupError is configured, so
  // a registration conflict propagates to the startup-await path. Re-syncs
  // and reconnect syncs always contain conflicts.
  const startupOpts: ToolBridgeOptions = config.failOnStartupError
    ? { ...opts, registrationFailure: 'throw' }
    : opts

  let disposed = false
  const maxInstructionBytes = config.maxInstructionBytes ?? DEFAULT_MAX_INSTRUCTION_BYTES
  let serverInstructions = ''
  /** Current generation: the connecting or connected client; undefined while no generation is attached. */
  let client: Client | undefined
  /** Transport-aware close operation paired with {@link client}. */
  let closeClient: (() => Promise<boolean>) | undefined
  /** Live tool registrations owned by this server; only {@link enqueueSync} and dispose swap it. */
  let disposers: ToolDisposers = new Map()
  let reconnectTimer: NodeJS.Timeout | undefined
  /** Consecutive failed connection attempts within the current outage. */
  let failedAttempts = 0
  /** Whether the exhausted budget already unregistered this outage's tools. */
  let toolsWithdrawn = false
  /**
   * Close barrier of a generation whose transport never confirmed closure. It
   * owns the retry loop until the barrier reports the transport gone, so a
   * replacement cannot overlap a surviving server process.
   */
  let stuckClose: (() => Promise<boolean>) | undefined
  /** When the current generation finished connect + initial sync; undefined while down. */
  let connectedAt: number | undefined
  /** The real error from the first connection attempt, for startup-await diagnostics. */
  let firstAttemptError: unknown
  /** The most recent failed attempt's error, cleared by the next successful generation. */
  let lastError: unknown

  /** A generation may act only while it is the current one on a live plugin. */
  const isCurrent = (generation: Client): boolean => !disposed && client === generation

  /**
   * Serializes every syncTools call — initial syncs and notification re-syncs
   * across all generations — so two syncs can never interleave their
   * dispose-previous/register-next swap (which would double-dispose one
   * generation and leak another).
   */
  let syncChain: Promise<void> = Promise.resolve()
  function enqueueSync(generation: Client, syncOpts: ToolBridgeOptions = opts): Promise<void> {
    const run = syncChain.then(async () => {
      if (!isCurrent(generation)) return
      disposers = await syncTools(generation, ctx, syncOpts, disposers)
    })
    // The chain tail must survive a failed sync; the enqueuing caller owns reporting.
    syncChain = run.catch(() => {})
    return run
  }

  /** One disconnect decision per generation: the isCurrent guard makes racing close/error signals idempotent. */
  function generationDown(generation: Client): void {
    if (!isCurrent(generation)) return
    client = undefined
    closeClient = undefined
    scheduleReconnect()
  }

  /** Decide retry ownership after a failed connection's close barrier settles. */
  function settleFailedGeneration(
    generation: Client,
    quiesced: boolean,
    confirmClose: () => Promise<boolean>,
  ): void {
    if (!isCurrent(generation)) return
    if (!quiesced) {
      // The transport never reported closure: a stdio child may still hold the
      // pipe. The barrier becomes the retry loop's owner — every tick re-checks
      // it and dispose closes through it, so no replacement can overlap a
      // surviving server process.
      client = undefined
      closeClient = undefined
      stuckClose = confirmClose
      ctx.logger.error(`${label}: failed generation could not confirm transport closure — reconnect deferred until the previous server process is gone`)
      scheduleReconnect()
      return
    }
    generationDown(generation)
  }

  /** Wait for the transport-owned close signal without letting a broken transport wedge teardown forever. */
  function waitForClose(closed: Promise<void>): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { resolve(false) }, GENERATION_CLOSE_TIMEOUT_MS)
      timeout.unref()
      void closed.then(() => {
        clearTimeout(timeout)
        resolve(true)
      })
    })
  }

  function scheduleReconnect(): void {
    // A disposed supervisor reports nothing and arms nothing.
    if (disposed) return
    const lostEstablishedConnection = connectedAt !== undefined
    if (!policy.enabled) {
      const message = lostEstablishedConnection
        ? 'connection lost and reconnect is disabled — registered tools will fail until an HMR reload or Host restart'
        : 'connection failed and reconnect is disabled — no tools were registered; reload the plugin or restart the Host to connect'
      ctx.logger.error(`${label}: ${message}`)
      return
    }
    // A connection that stayed up past the stability window (= maxDelayMs, the
    // longest backoff spacing) ended the previous outage: start a fresh budget.
    if (connectedAt !== undefined && Date.now() - connectedAt >= policy.maxDelayMs) failedAttempts = 0
    connectedAt = undefined
    failedAttempts += 1
    const overBudget = failedAttempts > policy.maxAttempts
    if (overBudget && !toolsWithdrawn) {
      // Enqueue the withdrawal so it cannot race an in-flight sync's phase-2
      // swap (which checks isCurrent inside the queue). Retries continue at the
      // ceiling: a stopped supervisor left the server unreachable until an HMR
      // reload or Host restart, which is the failure this budget guards.
      toolsWithdrawn = true
      syncChain = syncChain.then(() => {
        for (const dispose of disposers.values()) dispose()
        disposers = new Map()
        serverInstructions = ''
      })
      ctx.logger.error(`${label}: ${policy.maxAttempts} consecutive reconnect attempts failed — tools unregistered; still retrying every ${policy.maxDelayMs}ms`)
    }
    const delayMs = overBudget
      ? policy.maxDelayMs
      : Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** (failedAttempts - 1))
    const action = lostEstablishedConnection ? 'connection lost; reconnecting' : 'connection failed; retrying'
    const progress = overBudget ? `${failedAttempts} failed attempts` : `attempt ${failedAttempts}/${policy.maxAttempts}`
    ctx.logger.warn(`${label}: ${action} in ${delayMs}ms (${progress})`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      settling = runOutageTick()
    }, delayMs)
    // An armed reconnect timer must never hold the process open on its own.
    reconnectTimer.unref()
  }

  /**
   * One outage tick. A generation whose closure is still unconfirmed owns the
   * tick: its barrier is re-checked — never re-entered past — before any
   * replacement is created, and a barrier that still fails takes the next
   * delay instead of a new connection.
   */
  async function runOutageTick(): Promise<void> {
    /* v8 ignore next -- defensive: disposal cancels this tick's timer, and scheduleReconnect arms no other */
    if (disposed) return
    const confirmClose = stuckClose
    if (confirmClose !== undefined) {
      if (!await confirmClose()) {
        scheduleReconnect()
        return
      }
      stuckClose = undefined
    }
    await connectGeneration(false)
  }

  /**
   * One connection attempt: fresh transport + client (the MCP SDK binds a
   * Protocol to one transport for life), connect, then queue the initial tool
   * sync. The startup flag belongs to the attempt rather than the shared sync
   * queue, so an early notification cannot consume strict startup semantics.
   * Every failure settles through {@link settleFailedGeneration}; an
   * established generation leaves through whichever loss signal arrives first —
   * close or transport error report. Never rejects.
   *
   * @param startup - Whether this is the plugin's activation attempt.
   */
  async function connectGeneration(startup: boolean): Promise<void> {
    // Disposal closes the generations it owns; a tick that outlives it must not
    // create one that nothing will ever close.
    if (disposed) return
    const generation = new Client(
      { name: 'dsh-mcp-client', version: '0.0.1' },
      {
        capabilities: {},
        versionNegotiation: { mode: 'auto' },
        listChanged: {
          tools: {
            autoRefresh: false,
            debounceMs: 0,
            onChanged: () => { void refreshTools() },
          },
        },
      },
    )
    const closed: PromiseWithResolvers<void> = Promise.withResolvers()
    let attemptSettled = false
    let closeObserved = false
    /** One loss decision per generation, however many failures the transport reports. */
    let lossHandled = false
    let transport: Transport | undefined
    const hasClosed = (): boolean => closeObserved
    client = generation
    closeClient = closeGeneration
    generation.onclose = () => {
      closeObserved = true
      closed.resolve()
      // A failed connect owns its close barrier in the catch path below. An
      // established generation can transition down directly from this signal.
      if (attemptSettled) generationDown(generation)
    }
    generation.onerror = (error: Error) => {
      // An established HTTP generation has no other loss signal: its transport
      // stays open when the session dies. Repeated reports — one per failed
      // request or SSE retry — collapse into one reconnect; a connect-time
      // report belongs to the attempt's catch path instead.
      if (!attemptSettled || connectedAt === undefined || lossHandled || disposed) return
      lossHandled = true
      ctx.logger.warn(`${label}: transport reported a connection failure: ${String(error)}`)
      void (async () => {
        const quiesced = await closeGeneration()
        if (!isCurrent(generation)) return
        settleFailedGeneration(generation, quiesced, closeGeneration)
      })()
    }
    /** Unattached probes close through their transport; attached clients must also report transport closure. */
    async function closeGeneration(): Promise<boolean> {
      const attached = generation.transport !== undefined
      // Release the server-side session before closing: the close aborts the
      // request that would carry the release. Every caller reaches this point
      // with the generation's loss signals already disarmed — disposal, a
      // settled attempt, or one handled loss — so a refused release reports
      // here instead of starting a reconnect.
      try {
        await terminateSession(transport)
      } catch (error) {
        ctx.logger.warn(`${label}: could not release the server session: ${String(error)}`)
      }
      try {
        await (attached ? generation.close() : transport?.close())
      } catch (_error) {
        if (!attached) return hasClosed()
      }
      return !attached || hasClosed() || await waitForClose(closed.promise)
    }
    async function refreshTools(): Promise<void> {
      if (!isCurrent(generation)) return
      ctx.logger.info(`${label}: tool list changed, re-syncing`)
      try {
        await enqueueSync(generation)
      } catch (error) {
        if (!disposed) ctx.logger.error(`${label}: tool re-sync failed: ${String(error)}`)
      }
    }
    let instructions: string
    try {
      transport = createTransport(config)
      await generation.connect(transport)
      if (hasClosed()) {
        attemptSettled = true
        generationDown(generation)
        return
      }
      if (!isCurrent(generation)) {
        if (!await closeGeneration()) ctx.logger.error(incompleteDisposalMessage)
        return
      }
      const serverText = generation.getInstructions()?.trimEnd() ?? ''
      instructions = serverText ? `### MCP server: ${config.serverName}\n\n${serverText}` : ''
      if (Buffer.byteLength(instructions) > maxInstructionBytes) {
        throw new Error(`${label}: server instructions exceed maxInstructionBytes (${maxInstructionBytes})`)
      }
      await enqueueSync(generation, startup ? startupOpts : opts)
    } catch (error) {
      if (firstAttemptError === undefined) firstAttemptError = error
      lastError = error
      // Disposal clears current ownership before it closes the generation, so
      // only a live supervisor reports an attempt failure.
      if (isCurrent(generation)) ctx.logger.warn(`${label}: connection attempt failed: ${String(error)}`)
      const quiesced = await closeGeneration()
      attemptSettled = true
      settleFailedGeneration(generation, quiesced, closeGeneration)
      return
    }
    attemptSettled = true
    if (hasClosed()) {
      generationDown(generation)
      return
    }
    if (!isCurrent(generation)) return
    serverInstructions = instructions
    connectedAt = Date.now()
    lastError = undefined
    toolsWithdrawn = false
    stuckClose = undefined
    if (failedAttempts > 0) ctx.logger.info(`${label}: reconnected and re-synced tools (attempt ${failedAttempts}/${policy.maxAttempts})`)
  }

  /** The in-flight (or last settled) connection attempt; dispose awaits it for quiescence. */
  let settling = connectGeneration(true)

  // The ready promise settles when the first attempt finishes (regardless of
  // success). If the first attempt fails and reconnect is enabled, the
  // supervisor is already scheduling a retry — ready just reports the outcome.
  const ready: Promise<ConnectionOutcome> = settling.then(() => {
    // After settling: if client is set the initial connect+sync succeeded.
    // If not, the supervisor is retrying (error logged) and reports the real
    // error here.
    // Note: settling.then() is a microtask; stdio onclose is a macrotask — so
    // a server that crashes AFTER a successful initial sync cannot flip client
    // to undefined before this continuation runs.
    if (client !== undefined) return {}
    /* v8 ignore next -- defensive: firstAttemptError is always set when connect/sync fails */
    return { error: firstAttemptError ?? new Error(`${label}: initial connection failed`) }
  })

  return {
    ready,
    instructions: () => serverInstructions,
    status: (): McpConnectionState => {
      if (disposed) return 'stopped'
      if (connectedAt !== undefined) return 'connected'
      // A generation exists only while it is negotiating its transport; the
      // supervisor clears it before scheduling the next attempt.
      if (client !== undefined) return 'connecting'
      return policy.enabled ? 'reconnecting' : 'unavailable'
    },
    toolNames: () => [...disposers.keys()],
    error: () => lastError === undefined ? undefined : messageOf(lastError),
    resources: {
      async request(request, exec): Promise<JsonValue> {
        const generation = client
        if (!generation || connectedAt === undefined) throw new Error(`${label}: server is disconnected`)
        const options = { signal: exec.signal, timeout: config.toolCallTimeoutMs }
        switch (request.method) {
          case 'resources/list':
            return await generation.listResources(
              request.cursor === undefined ? undefined : { cursor: request.cursor }, options,
            ) as JsonValue
          case 'resources/templates/list':
            return await generation.listResourceTemplates(
              request.cursor === undefined ? undefined : { cursor: request.cursor }, options,
            ) as JsonValue
          case 'resources/read':
            return await generation.readResource({ uri: request.uri }, options) as JsonValue
          /* v8 ignore next 2 -- resource requests are the closed, typed tool operation union */
          default:
            return assertNever(request)
        }
      },
    },
    async dispose(): Promise<void> {
      disposed = true
      serverInstructions = ''
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      const close = closeClient ?? stuckClose
      client = undefined
      closeClient = undefined
      stuckClose = undefined
      if (close !== undefined && !await close()) {
        ctx.logger.error(incompleteDisposalMessage)
      }
      // Quiesce, don't just request it: the in-flight attempt enqueues its
      // sync before settling, so awaiting both leaves `disposers` final.
      await settling
      await syncChain
      for (const dispose of disposers.values()) dispose()
      disposers = new Map()
    },
  }
}
