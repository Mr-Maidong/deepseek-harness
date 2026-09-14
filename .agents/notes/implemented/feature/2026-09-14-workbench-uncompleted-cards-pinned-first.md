# Agent Note: Workbench todo cards pin uncompleted items above completed ones

Status: implemented

English | [中文](2026-09-14-workbench-uncompleted-cards-pinned-first.zh.md)

## Problem

The Studio workbench listed a project's todo cards by `updatedAt` alone, newest first ([workbench.tsx](../../../../packages/client/ui-studio/src/client/frame/workbench.tsx)). Checking a card done writes `updatedAt = completedAt`, so completing a card moved it to the top of the list — above the items still to do. On a board with many finished cards, the remaining work sank below them as soon as each older card was completed in turn, and the panel's most prominent rows were the ones needing no action.

## Decision

The card list ranks by completion first and recency second: `status === 'completed'` cards sort below every uncompleted card, and only within one group does `Date.parse(b.updatedAt) - Date.parse(a.updatedAt)` apply. The sort stays a `useMemo` derivation over the active project's `todos` in [workbench.tsx](../../../../packages/client/ui-studio/src/client/frame/workbench.tsx); the store's array keeps insertion order and no persisted data changes. `Array.prototype.sort` is stable, so equal timestamps keep store order inside a group.

Completed cards therefore stay ordered by completion time, because `completeTodo` sets `updatedAt` to `completedAt`; checking a card done immediately sinks it to the head of the completed group, and unchecking is impossible (completion is terminal in the store).

## Alternatives considered

**Reorder the store's `todos` array instead of deriving the order at render.** Rejected: card order is presentation state, and the store is the durable, workspace-shared record. Writing rank into it would persist a view preference, dirty the persisted payload on every completion, and couple the data layer to how the panel happens to be laid out.

**Group by completion only, dropping the recency sort.** Rejected: the existing newest-updated-first behavior is worth keeping; within the uncompleted group the most recently touched or sent card stays on top, and within the completed group the latest summary stays first.

**Rank `in_progress` above `pending` as a third tier.** Rejected: the request pins uncompleted against completed, and `sendTodo` already stamps `updatedAt` when a card starts running, so the active card reaches the top of the uncompleted group without a second rank axis.

**Separate the groups with a heading or divider.** Rejected as scope: ordering alone satisfies the request, and a labeled section boundary would add locale copy and card chrome the panel does not need.

## Consequences

Uncompleted work is always visible first, whatever its age, and finishing a card changes its rank immediately. Recency ordering inside both groups is unchanged, and ties keep store order. No locale copy, store field, persistence-format version, or session event changed — the rank is derived from `status` and `updatedAt`, which the store already carries.

## Testing

[workbench.client.spec.tsx](../../../../packages/client/ui-studio/tests/workbench.client.spec.tsx) covers the new rank: one case completes the most recently updated card and asserts the untouched uncompleted card stays above it; another completes both cards in creation order and asserts the completed group still orders by completion time. The existing newest-updated-first and reorder-on-edit cases keep passing unchanged.