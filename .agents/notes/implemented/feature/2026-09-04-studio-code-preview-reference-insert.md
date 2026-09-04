# Agent Note: code-selection reference insertion from the studio preview card

Status: implemented

English | [中文](2026-09-04-studio-code-preview-reference-insert.zh.md)

## Problem

The studio preview card renders a workspace file's source read-only. A user
reading a file often wants to point the ongoing conversation at the exact region
they are looking at, but the only route was manually retyping the path and line
numbers into the composer. The conversation already understands `@"path"` file
mentions, so the preview card should let the user select code and hand that
file, plus the selected line range, to the composer in one motion.

## Decision

- **Selection bubble.** Selecting text in a `code`-kind preview reveals a small
  floating "引入" button anchored just below the last selected line (the resting
  line under the cursor). The button only appears for a real, non-empty
  selection made inside the code content (verified via `window.getSelection()`
  and the code element's `Range.getClientRects()`), and disappears when the
  selection collapses or moves outside the card.
- **Draft reference format.** Clicking the button replaces the current session's
  composer draft with `@"<path>" L<start>-L<end>`, where the path is wrapped in
  double quotes exactly as the file-mention grammar's quoted form, and the range
  is the 1-based, inclusive first/last selected line. Example:
  `@"src/a.ts" L10-L20`. The text is a machine-readable draft format, not UI
  copy, so its literals live inline.
- **Row/column wiring.** `PreviewCard` gains an optional injected
  `insertReference(text)` callback, and the `studio.center.editor` slot
  registration supplies it from the apply closure. Because the editor seat is
  root-scoped (its inject factory receives no session id), the callback resolves
  the current session at click time from `sessions.list.getSnapshot().current`
  and reaches the composer's `conversation` service via the service-store read
  `ctx.get('conversation')` (not the `ctx.<name>` inject proxy, since
  `conversation` is not one of this plugin's declared injections):
  `conversation.input.for(sessions.scope(current)).setDraft(text)`.
- The optional injected prop keeps existing `PreviewCard` call sites (tests and
  the frame) compiling without it; the bubble simply does nothing product-facing
  when the callback is absent.

## Alternatives considered

**Injected a session id into the editor registration.** Deferred: the seat is
declared `scope: 'root'`, so its inject factory gets no session argument;
resolving the current session at click time matches the seat's actual scope and
needs no declaration change.

**Inserted an appended reference preserving the existing draft.** Rejected:
`SessionInput.setDraft` replaces the whole draft and re-merges it, which is the
established programmatic-composer path for a fresh reference; the requirement
was to put the reference into the composer, not to append to a running draft.

## Consequences

- Selecting code and clicking 引入 drops `@"path" Lstart-Lend` straight into the
  composer for the active session, ready to send.
- The inserted draft reuses the existing `@"path"` mention grammar, so the
  conversation's file-reference handling recognizes the quoted path; the line
  suffix is the card's own data-plane extension.
- The bubble is a visual affordance over the code surface; it does not alter the
  read-only preview or the file tree.
- Locale dictionary gains one key pair (`preview.reference`: zh 引入 / en
  Insert reference).

## Testing

`file-tree-preview.client.spec.tsx` covers the bubble appearing over a code
selection (anchored at the bottom of the last selected line), the composed draft
`@"/workspace/src/main.ts" L2-L3`, and the bubble hiding after insertion.
`pnpm run test:gui` stays green; the two unrelated pre-existing failures
(`ui-chat/chat-stats`, `ui-trajectory/views` tooltip timing) are unaffected.
