# Agent Note: Studio preview line numbers and quoted-line highlighting

Status: implemented

English | [中文](2026-09-10-studio-preview-line-numbers.zh.md)

## Problem

The floating preview card showed a workspace file as one unnumbered run of text. A reader arriving from a workspace search saw the card scroll to the matching line but had no line reference on screen, and the search jump flashed the whole surface, which marked no line in particular. A reader who wanted to quote a line had to drag across the text to raise the "insert reference" bubble: nothing showed which lines that bubble was about to insert, and pointing at one line needed a precise drag.

## Decision

The code kind of the card renders a line-number gutter beside the source, and the numbers carry the two highlights that matter.

- One row per source line, built from `preview.content.split('\n')`. The gutter is the first child of the scroll surface (`pre.code` is a flex row of `span.gutter` and `code.text`), so both columns share one scroll box and the surface's 22px line height, and every number stays aligned with its line without measuring text. The gutter is `position: sticky; left: 0`, so a long line scrolled sideways slides under a pinned column. `user-select: none` and `aria-hidden` keep the numbers out of selections, copies, and the accessibility tree.
- The search-jump hit line (`preview.focus.line`, clamped to the opened file) marks its number while that preview is open, which replaces the whole-surface flash. The scroll effect now measures the hit row's own rect against the surface instead of assuming a pixel line height.
- The lines a raised bubble quotes mark their numbers, so the range about to be inserted as `@"path" Lx-Ly` is visible on the card.
- Clicking a number quotes exactly that line: the browser selection is cleared, so the marked number and the bubble are the only claim on which line is referenced, and the insert produces a single-line `Lx-Lx` reference. Pressing the code text instead leaves a raised bubble alone.

Only the ready code state carries the gutter: a read in flight, a failed read, and an embedded artifact have no source lines to number.

`StudioPreview`'s ready state now discriminates on `kind` — `{ kind: 'code', content, language?, focus? }` against `{ kind: 'iframe', content }` — instead of one member carrying a `StudioPreviewKind`. The gutter needs the ready source state as a type (`Extract<StudioPreview, { status: 'ready'; kind: 'code' }>` was `never` while `kind` stayed non-literal), and the split states the truth that a language label and a focus line belong only to source.

## Alternatives considered

**One element per code line, numbered from CSS counters or a per-row span.** Rejected: the code element must keep holding exactly the file text, because the selection-to-line-range conversion measures character offsets against its `textContent` and a copied selection must not pick up digits. A per-line code body would also re-render every row on each selection change.

**A highlight band drawn over the text column.** Rejected: the file text is one node, so a row band needs either per-line elements or an absolutely positioned overlay sized from a line-height constant, and the card's translucent panel would let scrolling text show through the overlay.

**Keeping the temporary whole-surface flash beside the number highlight.** Rejected: the flash marked no line and mutated a CSS-module class on the `<pre>` from a timer, while the number highlight is render state that stays visible for as long as its preview is open.

**Numbering every preview kind.** Rejected: an embedded artifact renders a document rather than lines, and the reading and failure states have no content.

## Consequences

- A search jump is locatable: the card centers the hit row and marks its number until another preview replaces it.
- Quoting one line no longer needs a precise drag. Both routes — drag and number click — show the same highlighted numbers and use the same bubble.
- The gutter holds one element per source line inside the bounded read (1 MiB), so a very large file renders a correspondingly large gutter.
- The numbers are presentational and are excluded from selection and assistive technology; the keyboard path to a reference stays the text selection plus the bubble button.

## Testing

`tests/file-tree-preview.client.spec.tsx` covers the ready code gutter, its absence for the reading, failure, and iframe states, the clamped search-hit mark, the quoted range of a drag selection, click-to-quote (the cleared browser selection, the marked line, the single-line insert), a press that ends off the numbers, and the paths that quote nothing.

## Related

- [Studio universal preview card](2026-09-03-studio-universal-preview-card.md) — the kind-driven container this gutter lives in.
- [Code-selection reference insertion](2026-09-04-studio-code-preview-reference-insert.md) — the bubble this gutter marks lines for and can now raise from a number.
- [ui-studio package reference](../../../../packages/client/ui-studio/README.md) — the shipped surface.
