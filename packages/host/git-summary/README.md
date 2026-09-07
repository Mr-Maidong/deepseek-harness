---
description: "Host capability for reading a workspace directory's git branch and uncommitted change counts."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-git-summary

English | [中文](README.zh.md)

## Summary

`ctx.gitSummary` reports the current branch and the uncommitted insertion/deletion totals of one Host directory. The web GUI's Studio file tree shows that state; the browser cannot run `git`, so this seam answers the request on the Host through `ctx.subprocess`. A directory outside a repository reports `null` and the caller hides the affordance.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Compose this package as a Host plugin row to register `ctx.gitSummary`, then read it from a Host consumer such as the Workspace Remote controller. The composition must also mount a subprocess provider (`@deepseek-ai/dsh-subprocess-local` in the base bundle), because the local provider spawns `git` through `ctx.subprocess`.

### Reading the result

`summary(path, signal)` returns `{ branch, detached, insertions, deletions, untrackedFiles }` for the repository containing `path`, or `null` when no repository contains it. `branch` is `null` exactly when `detached` is true. Counts cover tracked changes against `HEAD` in both directions (staged and unstaged); `untrackedFiles` is a file count, not a line count.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Four bounded `git` invocations run in the requested directory: `rev-parse --show-toplevel` decides repository membership and fails the whole read to `null`, `symbolic-ref --quiet --short HEAD` yields the branch name, `diff --numstat -z <target>` supplies the line counts, and `ls-files --others --exclude-standard -z` counts untracked files. A repository whose `HEAD` is unborn diffs against git's empty tree object instead of failing. Any non-zero exit is treated as "this fact is absent" rather than an error, so a detached head or an unborn branch degrades the fields instead of the result. The `-z` forms keep paths containing newlines or tabs parseable.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the GUI-host git-state seam registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the seam leaves a decision to a future consumer. They are current package constraints, not a task backlog.

- **No caching** — every call spawns fresh `git` processes, so a caller that refreshes often pays process-launch cost each time. Caching with an invalidation trigger (filesystem events or session-turn boundaries) waits for a second consumer.
- **Untracked files count by file** — untracked paths contribute no lines, because line counting would need a bounded content read per file through the filesystem seam.
- **Working-tree scope only** — branch-versus-base cumulative counts are not reported; the contract fixes the comparison target at `HEAD`.
- **One provider** — only the local `git` CLI backend exists. A sandboxed execution world needs its own provider that resolves `git` in that world.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The verb is Workspace-scoped rather than path-scoped on purpose: the browser names a `workspaceId` and the Host resolves the directory, so the file tree cannot probe arbitrary host paths for repository state.

</details>

**Runtime invariant:** No companion is published. The service owns one stateless read whose only relationship is a `null` result for a non-repository, which the Remote controller and the file tree already check.
