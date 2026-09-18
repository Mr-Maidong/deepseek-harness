/**
 * The Session a preview card's own read runs under. The card is a root-scoped
 * seat, so the Session whose workspace resolves the previewed path comes from
 * the Session list on every call, and the frame store restores a preview before
 * that list has arrived. Both card faces — the edit buffer and the media bytes —
 * resolve it here, so one rule covers both reads: a pending list is waited for,
 * and a settled list without a selection is a real failure.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Reported when the Session list has arrived without a selected Session. */
const NO_SESSION = 'ui-studio: no session is open for this preview'

/** The slice of the Session list a card read resolves the previewed path against. */
export interface SessionSelection {
  /**
   * Read the current selection.
   * @returns the selected Session, and the list's arrival lifecycle, where
   *   `ready` without a Session means there is none to read under.
   */
  getSnapshot(): {
    readonly current: SessionId | undefined
    readonly phase: 'pending' | 'ready'
  }
  /**
   * Observe selection changes.
   * @param listener - called after every snapshot change.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void
}

/**
 * Resolve the Session a card read runs under.
 * @param sessions - the Session list the card reads under.
 * @returns the selected Session, or a rejection when the settled list has none.
 */
export function resolveSelectedSession(sessions: SessionSelection): Promise<SessionId> {
  // The verdict this snapshot carries: a selected Session, a settled list
  // without one, or nothing to decide yet.
  const verdict = (): { session?: SessionId; decided: boolean } => {
    const now = sessions.getSnapshot()
    if (now.current !== undefined) return { session: now.current, decided: true }
    // An arrived list without a selection is "truly no sessions", so the read
    // fails; a list still on its way is waited for.
    if (now.phase === 'ready') return { decided: true }
    return { decided: false }
  }
  const first = verdict()
  if (first.decided) {
    return first.session === undefined
      ? Promise.reject(new Error(NO_SESSION))
      : Promise.resolve(first.session)
  }
  return new Promise<SessionId>((resolve, reject) => {
    // The subscriber may run while `subscribe` itself is still executing, before
    // the disposer it would stop with exists, so one holder carries both the
    // settled flag and the disposer and the check after the call removes a
    // subscription that settled during it. The listener is removed at the first
    // decided snapshot.
    const lease: { settled: boolean; stop?: () => void } = { settled: false }
    const settle = (session: SessionId | undefined): void => {
      lease.settled = true
      lease.stop?.()
      if (session === undefined) reject(new Error(NO_SESSION))
      else resolve(session)
    }
    // No window exists between the read above and this subscription: both are
    // synchronous, so a list that settles in between notifies this listener.
    lease.stop = sessions.subscribe(() => {
      const next = verdict()
      if (next.decided) settle(next.session)
    })
    if (lease.settled) lease.stop()
  })
}
