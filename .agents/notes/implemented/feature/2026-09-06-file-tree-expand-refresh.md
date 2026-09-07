# Agent Note: file-tree folder reads refresh on expand

Status: implemented

English | [中文](2026-09-06-file-tree-expand-refresh.zh.md)

## Problem

The Studio file tree listed a directory once and kept that result for the lifetime of the panel, so files the agent created, edited, or deleted while a folder stayed open — or while it sat collapsed in the persisted expansion set — never appeared or disappeared. The user had no way to see current contents short of switching workspaces or reloading the page.

## Decision

Re-read a directory when it opens, and treat that read as the only invalidation trigger in `packages/client/ui-studio`:

- A path is read when it is absent from the previously rendered expansion set or when it has no cached listing. The workspace store persists `expandedPaths`, so a folder that stayed open through a collapse-and-reopen cycle is a fresh open and is re-read.
- Opening a folder re-reads every open path beneath it, so a collapsed subtree comes back holding what the filesystem holds now, not what it held before the collapse.
- One read per path is outstanding at a time: a request for a path that already has one in flight is dropped, so the workspace root's initial load and the first expansion pass cannot both fetch it.
- A failed read keeps whatever listing is already on screen. Only the workspace root has a panel-level failure state (`无法读取此目录`), because it is the one directory whose absence leaves nothing to render.
- Each read goes through the same `listDirectory(path, signal)` seam the initial load uses, and the expanding folder is the only trigger: no timer, no session-turn hook.

## Consequences

- Expanding a folder costs one directory read, and collapse-then-expand is the user's refresh gesture, so there is no separate refresh control, cache TTL, or staleness badge to design.
- The tree re-renders when a read settles, so a folder opened repeatedly is read repeatedly. Nothing is cached across an open, which is the point of the change.
- Folders that stay open while their contents change on disk are still not re-read: the browse seam has no watch, so only an expand settles staleness.
- The root row is keyed by the requested workspace path rather than the path the Host echoes back, so a persisted expansion entry written by an older build can leave the root collapsed until the user opens it once.

## Alternatives considered

- **A refresh button in the tree header.** Rejected: opening a folder is the gesture users already perform, and a second control needs its own placement, label, and enabled state to say less.
- **Host-side directory watches pushed to the client.** Deferred: the browse seam has no subscription, and a watch needs its own lifetime, an open-path cap, and an invalidation vocabulary before it can replace a user-initiated read.
- **Dropping descendant paths from the store when a folder collapses.** Rejected: it erases the layout the user built and still leaves the reopened subtree stale.
