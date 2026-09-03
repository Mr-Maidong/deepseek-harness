# Agent Note: Workbench todo card body, Summary divider, and update-time footer

Status: implemented

English | [中文](2026-09-03-studio-workbench-card-body-summary-divider-footer.zh.md)

## Problem

A 灵光 card rendered the task detail and the model summary stacked directly inside the card grid with no visual separation, so a long summary read as a continuation of the task detail. Card content had no height bound: a long detail or summary stretched the card and pushed sibling cards out of view. And the card displayed nothing about when its content last changed, although every todo carries an `updatedAt` timestamp.

## Decision

- **Summary divider**: between the task detail and the completion summary the workbench renders a separator labeled "Summary" (line—text—line). The word is locale copy (`workbench.summaryDivider`; the zh dictionary intentionally keeps the English word per the product look), the semantics are a `role="separator"` element.
- **Scrollable body**: the detail editor/detail button and the summary block now live inside a `.todoCardBody` grid with `max-height: 260px` and `overflow-y: auto`. Overflowing content scrolls inside the card instead of stretching it. The scrollbar mirrors the file tree exactly (`scrollbar-width: thin`, transparent until hover/focus-within, 6px webkit thumb colored `var(--studio-line)`), which StudioFrame defines for its whole subtree.
- **Footer status bar**: each card ends with `.todoCardFoot`, whose left corner shows the update time as compact relative time. The bucketing comes from the shared `relativeTime` in ui-primitives (same source as the workspace session rows) and the words live in this package's dictionary (`workbench.updatedNow`/`workbench.updatedAgo` wrapping the `time.*` bucket words). A 30-second interval re-renders the labels while the panel is mounted; the timestamp stays an ISO string in the store. The zh `workbench.updatedAgo` template is `{t}前更新` so a day-old card reads "1天前更新".
- **Expand/collapse**: the footer's right corner holds a text toggle (reusing the workspace's `aria-expanded` text-button pattern) that collapses the card body (`data-collapsed` hides it) and expands it back. The collapsed set is component-local state keyed by todo id.
- The separator line previously drawn by `.todoDetail`'s `border-top` moved to `.todoCardBody` (and the completed-card variant to `[data-done] .todoCardBody`), so the line stays above the scroll region instead of scrolling with the content; the editor keeps no inner top border to avoid a double line.

## Alternatives considered

**Draw the divider as a CSS `::after` pseudo-element on the detail button.** Rejected: the label text is real content with an accessibility role; a pseudo-element cannot carry it and the hover target of the detail button would grow.

**Absolute timestamps in the footer.** Rejected for the visible label: relative buckets match the session-row pattern; absolute time via `toLocaleString` would follow the browser language rather than the app locale.

**Scrolling the whole card list only (no per-card max height).** Rejected: one long summary would still push sibling cards below the fold; the request is specifically a bounded card body with its own scrollbar.

## Consequences

- Cards have a bounded middle region: long details/summaries scroll, head and foot stay fixed.
- The "Summary" divider appears only when a non-empty completion summary exists — a manually completed todo (empty summary) shows no divider.
- Relative-time labels stay accurate while the workbench is mounted, refreshed by the 30-second tick; after a remount they re-bucket from `Date.now()`.
- Locale keys grew by eleven (`workbench.summaryDivider`, `workbench.updatedNow`, `workbench.updatedAgo`, `workbench.expandDetail`, `workbench.collapseDetail`, six `time.*` buckets) in both zh and en dictionaries.

## Testing

`workbench.client.spec.tsx` covers the divider (role + localized label + position inside the scrollable body between detail and foot), the footer label (fresh update renders "刚刚更新", the tick keeps it fresh under fake timers), and the body container structure (detail and summary inside `.todoCardBody`, footer outside it). Full `test:gui` studio suite stays green.