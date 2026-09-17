# Agent Note: the studio todo list fades the ends that can still scroll

Status: implemented

English | [中文](2026-09-17-studio-todo-list-end-fades.zh.md)

## Problem

The workbench todo list scrolls inside the studio panel, which clips it: the top edge sits under the panel's own chrome and the bottom edge meets the add-todo form. A card taller than the remaining viewport was cut mid-content at both edges with no sign that more cards continued past them, so the list read as ending there. The conversation transcript and the chat turn rail both answer this with gradient masks at their scrollable ends; this list had none.

## Decision

The list masks each end that can still scroll, over the last 16px:

- `Workbench.module.css` adds `fadeTop` and `fadeBottom` masks plus the combined rule, using the same `mask-image` gradient form as the chat turn rail. The mask follows the scroller's own end, so it needs no overlay element, no stacking order, and no color token.
- `workbench.tsx` reads the two ends from the list's `scrollTop`, `scrollHeight`, and `clientHeight` with a 1px tolerance, re-reads them after every render — adding, expanding, or collapsing a card moves an overflow edge with no scroll event — and re-reads on scroll and on a `ResizeObserver` box change. An end that has nothing past it stays unmasked, so a one-card list keeps its only card fully opaque.
- The band is the list's own 16px: the transcript masks 24px and the clipped file path 28px, and these cards already carry 10px gaps between them.

## Alternatives considered

- **Mask both ends unconditionally.** Rejected: a list shorter than its scrollport would wash out the first card's top and the last card's bottom, and the workbench is usually opened with few todos.
- **Fade with an overlay element instead of a mask** (`::before`/`::after` over a gradient to the panel background). Rejected: it needs the panel's background as a token, adds a layer above the cards that can take pointer events, and breaks when the background changes.
- **Re-read the ends only on scroll.** Rejected: expanding a card or adding a todo changes the overflow without a scroll event, so the fades would lag the layout the user just caused.
- **Reuse the chat turn rail's scroll-state helper.** Not available: it is internal to `ui-chat`, whose presentation directory a feature plugin may not import values from.

## Consequences

- The mask also covers the list's thin hover scrollbar, whose thumb fades over the same 16px at the ends.
- The fades move only when an end changes, and a scroll that leaves both ends where they were re-renders nothing.
- jsdom implements neither layout nor masks, so the spec pins the class state that selects the mask, not the rendered gradient.
- No new user-facing copy, locale entry, Session event, or wire value; no styling token was added.

## Testing

The workbench spec's `StudioWorkbench todo list end fades` block pins: no fade while the content fits its scrollport, only the bottom fade at the top of a long list, both fades mid-list, only the top fade at the last screen, no class change when a repeated scroll leaves the ends alone, the observer that re-reads a resized box and disconnects on unmount, and the render with no active project, which has no list to fade.
