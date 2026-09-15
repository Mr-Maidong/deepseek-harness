# Agent Note: The iframe preview card sizes itself from its 16:9 stage

Status: implemented

English | [中文](2026-09-15-studio-iframe-card-content-sized-stage.zh.md)

## Problem

Studio's universal preview card is one floating shell that presents two kinds of content. A source file fills the conversation column between the header row and the composer bar, which suits an editor: more vertical space means more visible lines. A rendered artifact does not want that box. An embedded HTML document reads best at a fixed ratio of its own width, and the card had already given its frame a 16:9 stage — but the shell around it still took its height from `top` and `bottom` pins, so the stage sat at the top of a full-height card with dead space beneath it. The shell's size was set by geometry the artifact had no use for.

The same gap showed up in the read states. The card publishes `loading` before its file read settles, and only the settled state carries a kind chosen from the path. A chat file gesture on an HTML file published every state as `code`, so the card opened as a full-height source surface and then jumped to a different shape when the read landed. The three producers picked the rendered kind independently, and the newest of them picked none.

## Decision

A rendered artifact's card now takes its height from its content. `.preview[data-kind='iframe']` drops its height pins: `top` becomes `auto` and `bottom` reads the composer bar's own edge through CSS Anchor Positioning (`anchor-name: --studio-composer` declared on the seat in `StudioFrame.module.css`, consumed as `position-anchor` plus `bottom: calc(anchor(top) + 8px)`), so the card is content-sized and grows upward from that fixed bottom edge. The inset properties are written explicitly rather than delegated to `position-area`, because `position-area` sets the element's containing block and an auto-positioned box would then be centered inside it instead of held against the anchor. With no `top` pin, a tall composer draft or a short viewport pushes the card over the conversation header instead of squeezing the 16:9 stage out of proportion; the studio frame clips what would leave the window. The base rule keeps both pins, so an engine without anchor positioning falls back to the previous full-height card with the stage at its top. Source files are unchanged: they still fill the column.

One predicate owns the kind decision. `previewKindFor(path)` and `isRenderedArtifact(path)` live in `frame/contract.ts`, the package's shared contract layer, and the file tree, the header search, and the chat file opener all classify through it. Each producer resolves the kind once, before its read starts, and carries that same kind through `loading`, `ready`, and `error`, so all three states size the card identically and settling an HTML read never resizes it. A rendered artifact has no line grid, so a focus line travels only to a code buffer, and the embedded document carries no language label. The card renders loading and error text inside the same 16:9 stage element the frame later fills.

## Alternatives considered

**Keep the pins and let the frame stretch to fill the shell.** Rejected: this restores the pre-existing behaviour where an HTML document is distorted to whatever ratio the column happens to leave, which is exactly what the fixed stage exists to prevent.

**Size the shell with JavaScript from the measured stage.** Rejected: the layout already measures the composer seat with a `ResizeObserver`, and adding a second measurement loop for the card's own height duplicates work the platform does declaratively, breaks under a font-size change, and needs its own teardown discipline.

**Give the iframe card a `max-height` and compress the stage when it overflows.** Rejected after confirmation: a squeezed stage silently abandons the ratio the card exists to hold, and the header row it would protect is a stable piece of chrome, while the artifact is the content the user asked to see.

**Move the shared predicate into the `preview/` domain and import it from the other producers.** Rejected: `verify-client-domain-graph` forbids sibling-domain imports, and the extension list is a fact about `StudioPreview` itself, which lives in `frame/contract.ts`.

## Consequences

- Opening produced HTML gives a compact card whose height follows its width, instead of a full-height shell with empty space below the preview.
- The card can cover the conversation header row when the composer grows tall or the window is short. That overlap is the accepted cost of holding the ratio.
- Chat gestures on HTML files now render the document rather than showing its source, closing a gap left when the chat opener first routed conversation clicks into the universal card.
- Kind selection has one owner, so adding another rendered extension is one edit; the previous three-way duplication could and did drift.
- Engines without CSS Anchor Positioning keep the pinned full-height card. The fallback is a `@supports` rule, not a second implementation.
- No locale keys, store fields, persistence-format versions, or session events changed.

## Testing

`packages/client/ui-studio/tests/chat-file-opener.client.spec.ts` adds three cases: produced HTML publishes `iframe` on every state with no language label, a focus line a tool row named is dropped for a rendered artifact, and a failed HTML read settles on the iframe error card. `packages/client/ui-studio/tests/preview-edit.client.spec.tsx` adds two: the stage holds its status text across `loading` → `ready` → `error` in one container, and an iframe card wires no editor and no Save control. Existing tree and search assertions still pin the `kind` on each published state. Geometry itself is CSS-only and asserted nowhere; jsdom reports no computed layout, so the visual check belongs to `DSH_SNAPSHOT=replay pnpm run test:web`.
