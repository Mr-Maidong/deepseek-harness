# Agent Note: the preview card reports a modified file with a dot before its name

Status: implemented

English | [中文](2026-09-17-studio-preview-modified-dot.zh.md)

## Problem

The editor card's header carried a boxed text control between the language label and the close control, reading `保存` and `保存中…`. It named the action and left the state implicit — a reader had to catch the disabled/enabled flip to learn whether the buffer still differed from the file — and a bordered button sat in a header whose other controls are quiet glyphs.

## Decision

The header draws the file's state as one filled dot immediately before the file name, built from the same hand-drawn `Icon` wrapper as the card's other glyphs:

- `ModifiedDotIcon` is a filled `currentColor` circle. `PreviewCard.module.css` colors its container `var(--studio-muted)` while the buffer matches the file and `var(--studio-gold)` while the two differ, keyed on `data-modified`.
- The element stays a `<button>` with the same accessible name (`preview.save`), the same tooltip (`preview.saveHint`, or `preview.saving` while a write is in flight), the same `disabled` state while the buffer is clean or a write is in flight, and the same click-to-save behavior. The change is the drawing and the position, not the affordance: a pointer keeps the save the editor already offered, and the disabled state still reports that there is nothing to save.
- The dot renders under the condition the control already had — a code preview with an edit face and a loaded buffer — so read-only cards and rendered artifacts show none.

## Alternatives considered

- **Make the dot a decoration** (`<span aria-hidden>`) and leave `Ctrl+S` as the only save. Rejected: it removes the pointer's save without being asked, and the color would then be the only signal, with no accessible name behind it.
- **Keep the text control and add the dot.** Rejected: two controls for one fact, and the request is to replace the button.
- **Key the color on a class rather than `data-modified`.** Rejected: the workbench cards already publish their state as a data attribute, and a class join would hide the state it colors.
- **Add copy that names the state** (a `未保存` label or tooltip). Deferred: no dictionary entry is added by this change, and the tooltip plus the disabled/enabled state keep the control's semantics unchanged; a state-naming label is the natural next step if the color alone proves too subtle.

## Consequences

- The card's header is glyphs only, and the dot inherits the header's 12px gap before the file name.
- The dot stays gold while a write is in flight, because the buffer still differs until the write lands; its tooltip reports the step, and a refused or failed write keeps it gold with the card's failure band below.
- No copy, dictionary entry, Session event, styling token, or wire value changed; `preview.save`, `preview.saveHint`, and `preview.saving` stay in both dictionaries.
- jsdom applies no stylesheet, so the spec pins the state attribute and the DOM order, not the computed color.

## Testing

`packages/client/ui-studio/tests/preview-edit.client.spec.tsx` gains one case: the control holds the dot's circle, sits immediately before the file name, reports the buffer as matching the file at rest, reports it as modified after an edit, and returns to matching after a save from the dot. The in-flight case now asserts the dot stays modified (gold) with the saving tooltip while disabled, and the existing cases keep pinning the clean-buffer disabled state and the control's absence on a read-only card and on a rendered artifact.
