# Agent Note: Studio todo completions persist in the workspace store, terminal once completed

Status: implemented

English | [中文](2026-09-03-studio-todo-completion-workspace-persistence.zh.md)

## Problem

Studio 灵光池 tasks are workspace-dimensional: `project-todo-store` is registered with `storeScope: 'workspace'` and persists one pool per workspace (`dsh.studio.project-todos.v1`), so every session in a workspace shares the same task list. The model's completion summaries, however, were session-dimensional: `workbench_complete` appends a `studio/todo-complete` event to the executing session's log, the `studioTodoCompletions` session projection folds it per session, and the workbench rendered that projection **as a read-only overlay** over the workspace todos (`visibleProjects`). Because the workbench binds to the *currently open* session's projection store, switching sessions changed which completions were visible: a task completed in session A reverted to `pending` in session B's view, its summary vanished, and a reload showed whatever the current session's projection happened to carry. The workspace store's own `completion` field and `completeTodo` action existed but were never fed by the model path.

## Decision

The workspace todo store is the single source of truth for completion state; the session projection is demoted to a write-through channel.

- `workbench.tsx` no longer overlays `studioTodoCompletions` onto rendered todos. A `useEffect` folds every completion seen in the bound session's projection into the workspace store via `actions.completeTodo` — on mount (covers a projection baseline that already carries a completion from a prior visit) and on every projection change (covers a completion landing while the session is open). Rendering reads `todo.status` / `todo.completion` straight from the store, so completion state is identical in every session of the workspace and survives reloads.
- Completion is terminal. `project-todo-store` actions refuse to mutate a completed todo: `updateTodoStatus` never moves a completed todo (and cannot set `completed` — only `completeTodo` reaches it, so a summary is always attached), `updateTodoDetail` ignores edits, `removeTodo` skips completed records, and `completeTodo` is first-wins (a replayed projection or a later re-completion never rewrites a terminal record). The workbench disables the checkbox, edit, send, write-back, and delete controls on completed todos. New requirements are new todos.

## Alternatives considered

**Keep the projection overlay and only fix the reopen affordance.** Rejected: it leaves the dimensional mismatch — completions still vanish when the open session changes.

**Aggregate completions workspace-wide on the host (change `sessionProjections` to a workspace-scoped registry).** Rejected: the session-projection mechanism is uniformly per-session (folded from session events, keyed by session); repurposing it for one feature would fork the subsystem's semantics.

**Persist completions server-side (a workspace service) instead of the client store.** Rejected: project todos are a client-local model today; introducing server persistence for them breaks the no-server local scenario and adds a service seam the store already covers.

**Allow reopening a completed todo with a `reopenedAt` guard.** Rejected by product ruling: a confirmed-complete 灵光 is frozen; follow-up work is a new 灵光. Terminal state removes the reconcile-vs-reopen race entirely (no guard timestamp needed).

## Consequences

- A model completion folded into the workspace store is visible to every session sharing the workspace and survives reload, matching the workspace-shared design.
- Reconcile is idempotent: replaying the same projection (remount under a session whose baseline carries it, or duplicate events) is a no-op because `completeTodo` is first-wins.
- Residual edge: a completion that lands in session A while the workbench is bound to session B is folded only when the user returns to session A (the projection is visible only for the bound session). Terminal state keeps this harmless — no wrong-state risk, only deferred visibility. Execution normally happens in the open session the user is watching, so the common flow folds live.
- Completed todos are immutable in the UI and in the store; users create new todos for new work.
- A user may still mark an uncompleted todo done manually (empty summary, `completedBy: 'user'`); that state is equally terminal.

## Testing

`project-todo-store.client.spec.ts` covers terminal semantics: no reopen, no detail edit, no delete, and no rewrite after completion (model and user paths). `workbench.client.spec.tsx` drives the component with real store and projection fixtures: renders completion from the store, folds a projected completion on sight, folds a mount-time projection baseline, keeps a store-completed todo completed when the projection empties (session switch), and marks user-done terminal.
