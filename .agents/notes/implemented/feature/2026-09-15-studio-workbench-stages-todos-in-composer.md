# Agent Note: the workbench stages todos in the composer instead of sending them

Status: implemented

English | [中文](2026-09-15-studio-workbench-stages-todos-in-composer.zh.md)

## Problem

A workbench send control called `session.prompt([{ type: 'text', text: message }], 'queue')`, so one click dispatched the message to the model and moved the card to `in_progress` in the same gesture. The user had no chance to read, trim, or extend the message before it ran, and the card asserted a dispatch that the user might not have wanted at all.

## Decision

Staging writes the todo's heading, id, and detail into the Session's composer draft and leaves sending to the user. The composer's own session-scope standard share supplies the channel — `useInput` reads the live draft, `inputActions.setDraft` writes it — so no new import or inject face is involved. Staging appends after the draft already in the composer, because one click must not silently destroy text the user typed. With nothing reaching the model, the send paths no longer change the todo's status and no longer carry a failure branch; the card keeps the status it had. Write-back still sends straight to the chat, since the whole point of that action is to make the model answer, and the labels for the two staging controls name the input box.

## Alternatives considered

- **Keep marking the todo `in_progress` when staging.** Rejected: the card would claim the model is working on an item that is only sitting in the composer.
- **Replace the draft rather than append to it.** Rejected: it discards the user's in-progress draft on a single click, and `setDraft`'s replacement semantics exist for seeding a persisted draft, not for merging staged text.
- **Route write-back through the composer as well.** Rejected: write-back exists to have the model write a summary back, so staging it would force a second manual send for an action that is already a deliberate request.
- **Add a workbench-specific inject for the composer.** Unnecessary: `inputActions` is a session-scope standard share, so the slot already receives it.

## Consequences

- The staged message still carries the todoId heading the model must echo when it calls `workbench_complete`, and the user can edit the text before sending it.
- `updateTodoStatus` now has no production caller. It stays because persisted workspace stores can still hold `in_progress` and `blocked` todos that the card renders.
- The send controls are covered by the workbench spec for the empty-draft, non-empty-draft, whitespace-only-draft, and send-all cases, plus one case pinning that write-back still sends directly.