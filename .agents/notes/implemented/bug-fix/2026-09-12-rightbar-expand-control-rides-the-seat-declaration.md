# Agent Note: the right column's expand control rides the panel seat's declaration

Status: implemented

English | [中文](2026-09-12-rightbar-expand-control-rides-the-seat-declaration.zh.md)

## Problem

The studio suite disables ui-layout and re-declares the shipped top-level seats itself, and its frame has no right column. It declared `rightbar` only to keep the panel's registrants alive, but the frame never rendered that seat — while ui-sidebar-right's expand control lives in the conversation header, whose seat is declared by ui-conversation and therefore did render. The studio thus showed a button that set an invisible expansion state and opened nothing, and pressing it made the button itself disappear with no panel behind it.

## Decision

The expand control now registers inside ui-sidebar-right's `rightbar` declaration scope: the panel seat, the session seat, and the header control install and roll back as one contribution. A shell that declares no `rightbar` seat — the studio composition, which now omits it — leaves all three waiting instead of standing a dead control in the conversation header. The services (`ctx.sidebarRight`, `ctx.sidebarRightTabs`) stay provided at apply's top level, so every consumer keeps activating.

## Alternatives considered

- **Keep the seat declared in the studio and hide the button from the component.** Rejected: it needs a "this shell has no right column" capability flag on `ctx.layout`, when the slot declaration already states exactly that.
- **Disable the ui-sidebar-right row in the studio overlay.** Rejected: four packages consume its services, so disabling the row would strand them and drop the skill and reference entry points along with it.
- **Render the right column in the studio frame.** Out of scope: the studio's three-column workbench has no place for it, and the request was to hide the control, not to build the column.

## Consequences

- The default composition is unchanged: ui-layout's AppFrame declares `rightbar`, so the expand control appears exactly as before.
- In the studio, ui-sidebar-files, ui-sidebar-documentpreview, ui-skill, and ui-reference keep their services; their contributions into `sidebar.right.pane.tab` simply wait with the seat.
- ui-sidebar-right's apply spec covers the gating (no declaration, no control; declaration, panel and control together), and the studio boot lane continues to prove the overlay composition activates.
