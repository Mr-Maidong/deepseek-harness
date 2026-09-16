# Agent Note: the studio workspace list shows running sessions with the matrix animation

Status: implemented

English | [中文](2026-09-16-studio-running-session-status.zh.md)

## Problem

The Studio workspace list rendered every session with the same static conversation icon, so a running session looked exactly like an idle one. The native workspace browser (`ui-workspace`) already answers this with `StateDot`'s `ongoing` pixel-matrix animation, and collapsing a workspace card hid the session rows entirely, leaving no visible sign that anything in that workspace was running.

## Decision

`WorkBase` reads the `running` bit that `SessionListState.byId` already carries and renders `StateDot state="ongoing"` from `@deepseek-ai/dsh-client-ui-primitives` at two sites:

- A running session's row replaces the static `SessionIcon` with the animation. The animation keeps its native 10px box inside a fixed 16px slot, so the row title does not move and the pixel grid is not resampled at a non-integer scale.
- While any of a collapsed workspace card's visible sessions runs, the card renders the animation immediately before the workspace name. With nothing running it renders no status slot at all, so an idle collapsed card leaves no blank placeholder beside its name.

`StateDot` is `aria-hidden`, so both sites carry the locale-owned `session.running` label in a visually-hidden span. A running row's dot keeps the state palette's own running color rather than the current-session gold that tints the static icon.

## Alternatives considered

- **Put the signal on the 「工作区」 section header instead of the card.** Rejected: collapsing that section hides the workspace cards and their names as well, so the indicator would describe no particular workspace, and the confirmed requirement is the collapsed card.
- **Reserve the header slot in a collapsed card even while nothing runs.** Rejected: it leaves a blank placeholder beside the workspace name, which reads as a missing status rather than a quiet one.
- **Mount the header status slot in every card, expanded or collapsed.** Rejected: it indents every workspace name by the status column at all times, while the animation only carries information where the session rows are hidden.
- **Add a Studio-local CSS animation instead of reusing `StateDot`.** Rejected: it duplicates the native workspace browser's matrix chase, its palette, and its reduced-motion ownership.
- **Extend the swap to `completed` and `pendingInteraction`.** Not part of this decision: the Studio list has no surface for those states and the request was the running signal alone.

## Consequences

- The `studio-left-panel` namespace gains one key, `session.running`, in both dictionaries.
- The animation's palette (`--dsw-static-deepseek-450`), 1s chase, and reduced-motion behavior stay owned by `ui-primitives`; Studio adds layout slots only.
- A collapsed card's name shifts by that 16px slot when its first visible session starts running or its last one stops; rendering no placeholder is worth the movement.
- Idle rows keep the static icon; no export, configuration field, Session event, or wire format changed.

## Testing

`packages/client/ui-studio/tests/workbase-running-status.client.spec.tsx` renders the panel from a stub session list and pins: the running row's `svg[data-state="ongoing"]` preceding its title, the idle row's missing animation, the collapsed card's animation preceding the workspace name, the expanded card's clear header, the animation appearing when a card collapses, and an idle collapsed card carrying neither the animation nor a placeholder slot.