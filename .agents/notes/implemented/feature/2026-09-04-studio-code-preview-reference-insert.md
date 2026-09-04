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
  floating "引入" button anchored ≈8px below the last selected line (the resting
  line under the cursor). The anchor is computed against the `.codeWrap`
  positioned ancestor rect (not the outer `.preview` card rect, which includes
  the header and would offset the bubble downward). The button only appears for
  a real, non-empty selection made inside the code content (verified via
  `window.getSelection()` and the code element's `Range.getClientRects()`), and
  disappears when the selection collapses or moves outside the card.
- **Chip + suffix insertion.** Clicking the button inserts a file-reference chip
  (short file-name label, `@"path"` clipboard text, `appearance: 'file'`) at
  the composer caret, followed by the line-range suffix `L<start>-L<end>` as
  plain text. The chip renders as the standard `@file` marker style in the
  composer rather than raw `@"path"` text. The `SessionInput` contract gains
  `insertReferenceAtCaret(ref, suffix?)` which internally resolves the caret
  span and revision, inserts the chip + trailing space, then appends the suffix.
- **Structured callback.** `PreviewCard` gains an optional injected
  `insertReference(ref: CodeReference)` callback accepting `{ path, startLine,
  endLine }`. The `studio.center.editor` slot registration builds the
  `ReferenceInsert` (`source: 'reference'`, `ref: @"path"`, `label: shortName`,
  `appearance: 'file'`, `clipboardText: @"path"`) and calls
  `input.insertReferenceAtCaret(ref, suffix)`. Because the editor seat is
  root-scoped, the callback resolves the current session at click time from
  `sessions.list.getSnapshot().current` and reaches the composer's
  `conversation` service via `ctx.get('conversation')`.
- **Click-outside dismiss.** A document-level `pointerdown` listener dismisses
  the bubble when clicking outside both the code surface and the bubble button
  itself. Without this, deselecting by clicking elsewhere left the bubble
  visible because `mouseUp`/`keyUp` only fire on the `<pre>` element. The
  bubble button is excluded from dismissal so its `onClick` handler fires
  after `pointerdown`.
- **Focus outline removed.** The `<pre>` has `tabIndex={0}` for selection
  support, which causes a browser `focus-visible` ring on Shift key. Since the
  preview is read-only, `.code` sets `outline: none`.
- The optional injected prop keeps existing `PreviewCard` call sites (tests and
  the frame) compiling without it; the bubble simply does nothing product-facing
  when the callback is absent.

## Alternatives considered

**Injected a session id into the editor registration.** Deferred: the seat is
declared `scope: 'root'`, so its inject factory gets no session argument;
resolving the current session at click time matches the seat's actual scope and
needs no declaration change.

**Plain-text `setDraft` with scan-derived decoration.** Rejected: writing
`@"path"` as raw text only produces a chip-family decoration when a matching
lexicon entry exists; real chips require `insertReference` with a
`ReferenceInsert`. The chip approach gives the standard short-file-marker style
the user expects.

## Consequences

- Selecting code and clicking 引入 inserts a file-reference chip (short file
  name marker) followed by `Lstart-Lend` into the composer for the active
  session, ready to send.
- The chip serializes via the `reference` source codec on submit (same path as
  the `@file` trigger pick), so the model receives the file mention verbatim.
- The bubble anchors against `.codeWrap` coordinates with an 8px gap, matching
  the visual expectation regardless of the preview card header height.
- The bubble is a visual affordance over the code surface; it does not alter the
  read-only preview or the file tree.
- Locale dictionary gains one key pair (`preview.reference`: zh 引入 / en
  Insert reference).

## Testing

`file-tree-preview.client.spec.tsx` covers the bubble appearing over a code
selection (anchored at the bottom of the last selected line), the structured
callback receiving `{ path, startLine, endLine }`, the bubble hiding after
insertion, and click-outside dismissal. `pnpm run test:gui` stays green; the
two unrelated pre-existing failures (`ui-chat/chat-stats`,
`ui-trajectory/views` tooltip timing) are unaffected.
