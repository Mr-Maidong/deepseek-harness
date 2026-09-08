---
description: "Host capability for plain-text code search over a workspace directory via ripgrep."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-workspace-search

English | [中文](README.zh.md)

## Summary

`ctx.workspaceSearch` runs a plain-text search over one Host directory and returns a bounded, one-shot result with line/column positioning. The web GUI's Studio search panel uses it; the browser cannot run `rg`, so this seam answers the request on the Host through `ctx.subprocess`. The search honors `.gitignore` and the provider's configured limits, and reports whether a limit truncated the result.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Compose this package as a Host plugin row to register `ctx.workspaceSearch`, then read it from a Host consumer such as the Workspace Remote controller. The composition must also mount a subprocess provider (`@deepseek-ai/dsh-subprocess-local` in the base bundle), because the local provider spawns `rg` through `ctx.subprocess`.

### Reading the result

`search(path, query, signal)` returns `{ files, fileCount, matchCount, truncated, durationMs }`. Each file carries its POSIX-relative path and its matches; each match carries a 1-based `line` and `column`, a bounded `preview`, and `matchStart`/`matchLength` as UTF-16 code-unit offsets into the preview, so a browser can slice the preview with native string indexing regardless of multibyte content. `truncated` is true when a file, match, or output-byte limit stopped the search early.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One `rg` invocation runs in the requested directory with `--json --fixed-strings --color never --hidden --no-messages`, a `--max-filesize` cap, and `--glob` exclusions for `.git`, `node_modules`, `dist`, `lib`, `build`, and `coverage`. The binary is the packaged `@vscode/ripgrep` executable (an npm dependency), so no host `rg` install is required. The query is passed after a `--` separator so a query beginning with `-` is never parsed as a flag, and `--fixed-strings` keeps it plain text. `.gitignore` is honored because `--no-ignore` is deliberately not passed. ripgrep's byte offsets are converted to UTF-16 code units so the browser can index the preview natively; a 4-byte sequence counts as a surrogate pair. Exit code 1 (no matches) is a valid empty result, not an error; exit code 2 is an error; a signal-killed child returns whatever was collected before termination.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the GUI-host workspace-search seam registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the seam leaves a decision to a future consumer. They are current package constraints, not a task backlog.

- **Plain text only** — the query is never interpreted as a regular expression; regex search waits for a second consumer.
- **No streaming** — the result is one-shot and bounded; incremental result delivery waits for a consumer that needs it.
- **No index** — every call spawns a fresh `rg` process, so a caller that searches often pays process-launch cost each time.
- **One provider** — only the local ripgrep backend exists. A sandboxed execution world needs its own provider that resolves `rg` in that world.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The verb is Workspace-scoped rather than path-scoped on purpose: the browser names a `workspaceId` and the Host resolves the directory, so the search panel cannot probe arbitrary host paths.

</details>

**Runtime invariant:** No companion is published. The service owns one stateless read whose only relationships are the bounded result and the `truncated` flag, which the Remote controller and the search panel already check.
