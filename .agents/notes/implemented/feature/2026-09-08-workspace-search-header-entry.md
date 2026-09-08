# Agent Note: workspace search moves to the conversation title row

Status: implemented

English | [中文](2026-09-08-workspace-search-header-entry.zh.md)

## Problem

Workspace search shipped as a fixed band inside the Studio left panel (WorkBase above, file tree below), spending a permanent row of the narrow workspace column on a tool used intermittently. The band also duplicated a seat the conversation header already owns: the title row's utilities slot (`conversation.session.header.utilities`), whose purpose is right-aligned per-Session utilities.

## Decision

Search lives in the conversation titleRow's rightmost utilities seat, and results render as a floating panel anchored under the trigger (`packages/client/ui-studio`):

- `HeaderSearch` registers into `conversation.session.header.utilities` through `ctx.slots.inject`, with the highest list order so it sits rightmost, and renders a search trigger that toggles a floating panel portal-mounted into the studio frame node (`useAnchoredPosition` right-aligned under the trigger, dismissed by `useDismissOnOutsidePointer`, closed by Escape with trigger focus restored).
- The Session-scoped entry receives `workspaceId` resolved at registration time from the workspaces snapshot (the workspace whose `sessionIds` contains the entry's `sessionId`); the search and file-read closures are shared with the left-panel entry's inject face.
- The panel's result rows publish the preview flow the file tree uses (`loading` → `ready` with `focus {line, column}` → `error` on a failed read), then close the panel. Preview writes cross scopes through a bridge captured by the root registration's inject hook: the hook receives the baked actions of the frame's exclusive studio store and binds `setPreview`; a Session-scoped registrant cannot declare a root-scoped store, and the store handle itself is never shared across scopes.
- The query is debounced (250 ms), Enter searches immediately, and a monotonic request id plus an AbortController keep only the latest request's result; cancel on empty query and on unmount.
- The inline `SearchPanel` band and its section are removed from `LeftPanelMain`.

## Alternatives considered

- **Keep the band in the left panel and add a collapse state.** Rejected: it keeps the permanent row cost and splits one tool across two places; the utilities seat is the composition's designated home for right-aligned Session utilities.
- **Session-scoped store copy of the preview state.** Rejected: two stores would own one preview surface; the editor seat is root-scoped and reads the frame's store, so a second store would need its own synchronization and could disagree with the frame.
- **Reuse the inline panel without the floating list.** Rejected: the header has no room for inline results; a dropdown-style floating panel is the only form that fits the seat without pushing the title out.

## Consequences

- The workspace column gets the search band's height back; the file tree and WorkBase split the full column.
- The panel portals into the studio frame node (`document.body` only when no frame marker exists), so it inherits the frame's `--studio-*` token scope and restyles the search surface with the universal preview card's language: translucent blurred panel, `--studio-line` hairlines, gold accents.
- The header entry's `workspaceId` is resolved once per registration, not reactively; a Session that moves workspaces keeps the resolved id until re-registration, matching the header's per-Session lifetime.
- The bridge fails loud if the root entry is not mounted; nothing else can reach the frame's store.

## Testing

`packages/client/ui-studio/tests/header-search.client.spec.tsx` pins the portal mount, outside-pointer dismissal, Escape-with-focus behavior, debounce/Enter/race discipline, empty-query clear, preview publish with focus coordinates, failure message, truncation notice, and the in-flight suppression of stale rows.