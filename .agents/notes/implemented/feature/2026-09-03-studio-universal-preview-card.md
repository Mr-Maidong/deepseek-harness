# Agent Note: Studio universal preview card (code, HTML/iframe)

Status: implemented

English | [中文](2026-09-03-studio-universal-preview-card.zh.md)

## Problem

The Studio floating read-only preview card could only show source as code. The same card shape is wanted for future extensions — an iframe that renders produced artifacts (HTML, and later any renderable output) directly. The card needed a generic container whose display mode is selected per content, and code preview became one of several kinds.

## Decision

The `StudioPreview` owner data gains a `kind` discriminator: `'code'` (the existing language-tagged source view) or `'iframe'` (a sandboxed frame embedding the produced content). Every status carries a kind so the card stays consistent while a read is loading or has failed. `CodePreview` was renamed `PreviewCard` and dispatches on `kind`: code kinds render the `<pre>/<code>` source view; iframe kinds render a `<iframe>` with `srcDoc` set to the content inside a sandbox (`allow-scripts allow-forms allow-popups`, deliberately without `allow-same-origin`) so scripts run in an opaque origin and model-produced HTML cannot reach the app origin. The file tree picks the kind from the selected file's extension — `.html`/`.htm` open as iframe, everything else as code — so selecting a produced HTML file immediately shows the rendered artifact instead of raw source, with no new user-visible control. The card's `aria-label`/title region stays localized (`preview.title` vs the new `preview.html`).

## Alternatives considered

**Only prepare the container, leave all kinds unused.** Rejected after product confirmation: the iframe path should be live now for HTML so the extension point is exercised, not dormant.

**Use a URL/srcdoc-based `<object>` or external tab.** Rejected: `srcDoc` on a sandboxed iframe keeps the artifact inside the card while the surrounding document never loads remote or host-relative sources.

## Consequences

- The card is now a universal, kind-determined container: adding another display mode is a new kind + a render branch, no change to the floating card or slot wiring.
- Produced HTML files now render (sandboxed, non-interactive host access) instead of showing as source.
- `kind` appears on every `StudioPreview` status, so all preview producers must set it; the file tree is the one producer today.
- Locale keys grew by one (`preview.html`) in both dictionaries; the region label/aria-label localizes "HTML 预览".

## Testing

`file-tree-preview.client.spec.tsx` now asserts the `kind` on every status the tree publishes (loading/ready/error for code and for iframe), and that an iframe card renders a sandboxed `<iframe>` whose `srcdoc` equals the produced content while a code card still shows the source view. `test:gui` studio suite stays green.
