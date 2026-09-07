# Agent Note: Git summary capability seam for the Studio file tree

Status: implemented

English | [中文](2026-09-05-git-summary-capability.zh.md)

## Problem

The Studio file tree needs to show which git branch the active workspace sits on and how many lines the uncommitted work adds and removes. The browser cannot run `git`, and no existing Host capability reports repository state: `ctx.fs` reads files but has no notion of a working tree, and the Workspace records store only the directory path. The presentation also must not be able to ask about an arbitrary host directory, because the browser chooses what the file tree displays.

## Decision

Add a narrow Host capability seam and one Remote verb over it:

- **`packages/host/git-summary`** declares `GitSummaryRuntime` (`ctx.gitSummary`) with the single method `summary(path, signal)`, and ships `LocalGitSummary` as its default export. The provider runs four bounded `git` invocations through `ctx.subprocess` (`static inject = ['subprocess']`) and returns `GitSummaryResult` — branch, detached flag, insertion and deletion totals, untracked file count — or `null` when no repository contains the directory.
- **`workspace/gitSummary`** is a `@Remote` verb on `WorkspaceController` that takes `{ workspaceId }`, resolves the directory through the Workspace registry, and delegates. It reads the capability through `ctx.get('gitSummary')` and raises the `workspace/git-summary-unavailable` Remote code when no provider is composed.
- **`packages/client/ui-studio`** fetches through the injected `gitSummary` callback and renders one footer bar below the file tree. The bar itself is the button: clicking anywhere on it re-reads, and a newer read aborts the previous one. The fetch belongs to the plugin's inject face; the component receives data and a refresh callback, so no component touches `ctx`. The entry declares both `remote` and `remote.workspace` in its Cordis inject list — reading the nested `ctx.remote.workspace` face under a bare `remote` declaration throws before the request is built.

Uncommitted changes are counted against `HEAD` (staged and unstaged together); a repository with an unborn `HEAD` diffs against git's empty tree object so the counts still mean something on the first commit.

## Consequences

- The web bundle composes one more Host row, and every consumer of the generated `WorkspaceRemote` face — including the test fakes in `packages/api/workspace-controller` and `packages/api/session-controller` — gains the `gitSummary` member.
- Each refresh of the footer costs four process launches. Nothing caches, because there is only one consumer with a user-initiated refresh; a background-polling consumer would need an invalidation trigger first.
- Non-repository directories and detached heads degrade individual fields instead of failing the read, so the bar stays visible: `null` renders `Git 未初始化`, a rejected read renders `Git 状态不可用` with the Host message in the bar's tooltip, and the absence of a selected workspace renders `未选择工作区`.
- The read is browser-visible only. No session event is written, because nothing reaches a model request.

## Alternatives considered

- **Extend `ctx.fs` with a git query.** Rejected: the filesystem contract has no repository concepts, and widening it would put working-tree semantics behind file-policy code.
- **Pass a directory path from the browser to the Remote verb.** Rejected: the browser would then be able to probe any host path for repository state. Taking `workspaceId` keeps the path choice on the Host, where the registry owns it.
- **Report branch-versus-base cumulative counts.** Deferred: it needs a base-ref resolution rule, and the confirmed presentation is uncommitted work.
- **Refresh on every session turn end.** Deferred: the seam has no cache, so turn-end refresh would spawn git processes on activity unrelated to the file tree.
