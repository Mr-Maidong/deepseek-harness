---
description: "Studio workspace navigation and source preview with guarded in-place editing for users and maintainers composing the web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studio

English | [中文](README.zh.md)

## Summary

Studio provides a three-column workspace for navigating sessions, browsing the current workspace, previewing bounded text files, editing and saving a workspace file in place, and managing project todos. Choose it when the web client needs an editor-style surface with an editable file preview. File reads stay on the Host/Remote path and never grant the browser direct filesystem access.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount Studio when the web client needs workspace navigation, a file tree, an editable source preview, and a project workbench.

### When to choose it

Choose Studio for an editor-style layout. Choose the lower-level workspace package when another layout owns the presentation.

### Minimal configuration

The package is loaded by the Web composition and has no user-configurable fields. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for accepted configuration fields.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host directory-picker browse capability validates and bounds text reads. The workspace Client service maps the result to a preview with an extension-derived language label. A file click publishes a status-carrying preview (`loading` → `ready`/`error`) through the owner callback, so the floating card shows the read state itself while the tree keeps rendering. StudioFrame owns preview state and renders PreviewCard anchored above the composer bar through `studio.center.editor`; the card is a kind-driven universal container whose kind one shared predicate picks from the path, so the file tree, the header search, and the chat opener all classify the same file the same way. `code` fills the column between the header row and the composer bar and shows source; `iframe` sizes itself instead: its stage is 16:9 of the card's width and the shell hugs that stage, with its bottom edge anchored to the composer bar (`anchor-name: --studio-composer`) and no top pin, so a tall draft or a short viewport grows the card upward over the conversation header rather than squeezing the artifact out of proportion. Loading and error text sit on that same stage, so settling an HTML read never resizes the card. Opening a source file opens it as an editor, not as a read with a mode to switch: the card reads the file's complete bytes through the workspace-file Remote (`workspaceFiles.readAll`) with the version they carry and shows them in a line-numbered buffer whose caret is already in place, so typing needs no click. The frame store restores the card from browser storage on a page reload, before the Session list has arrived, so that first read waits for the list instead of reporting a failure to retry; a list that arrives without a selected Session is a real failure and says so. `Ctrl+S` (or the Save control) writes the buffer through `workspaceFiles.write` under that version, so a file that changed since the read is refused (`workspace-file/version-conflict`) instead of overwritten — the card keeps the buffer and offers to reload. A successful save keeps the version the write produced and re-reads the file through the ordinary preview read, so the frame store, the content, and the language label stay one source of truth. The card also suppresses the browser's context menu, leaving that gesture for the card's own actions. File rows use Host-listed paths unchanged. Expanding a folder re-reads it, and opening one re-reads every folder still held open beneath it, so a collapsed subtree comes back with the directory's current contents; a failed re-read keeps the rows already on screen.

A source file renders as the file text beside a line-number gutter whose numbers mark the search hit and the lines the "insert reference" bubble quotes; clicking a number quotes exactly that line. The reading, failure, and embedded-artifact states carry no gutter, and the numbers stay out of copied selections.

Workspace search lives in the conversation titleRow's rightmost utilities seat (`conversation.session.header.utilities`): a search trigger opens a floating results panel right-aligned under it, styled with the universal preview card's `--studio-*` token language and portal-mounted into the studio frame node, backed by the Host ripgrep plain-text search (`remote.workspace.search`). The query is debounced, Enter searches immediately, and a monotonic request id plus an AbortController keep only the latest request's result. Result file paths are fully qualified host paths, the same identity the file tree and the bounded read use; the panel labels them relative to the workspace root. Clicking a match publishes the same preview flow (scrolled to the match line/column) and closes the panel. The header entry resolves the Session's workspace at registration time and publishes previews through a root-entry bridge into the frame's exclusive preview store — a Session-scoped registrant cannot declare a root-scoped store.

Studio also provides the `chatFileOpener` service that ui-chat reads through `ctx.get`: every chat file gesture — a tool row's path link, a produced-file chip, a closing-message mention — opens in the universal preview card instead of the right Sidebar when Studio is composed. The opener resolves relative paths against the viewed Session's workspace root, publishes the loading → ready/error flow at the kind the path names — produced HTML opens as a rendered artifact on the 16:9 stage, not as source — carries an optional focus line for source files only, and rejects with the reason so the chat view's open-error dialog surfaces failures unchanged. Composing this package out is the off state: ui-chat falls back to its Sidebar route.

A workbench todo never leaves the client on a click. The send controls stage the todo's heading, id, and detail into the Session's composer draft — appended after whatever the user already typed, so staging cannot discard a draft in progress — and the user sends it. The card's status therefore stays as it was, because nothing has reached the model; only write-back still sends straight to the chat, since that action exists to make the model answer. The write-back request asks for the todo's whole record — the complete result from the start, later corrections included — because `workbench_complete` replaces that todo's earlier record when the model calls it again. The todo list fades its cards over the last 16px at each end that can still scroll, so a card the panel edge cuts off never reads as the list's end.

Each workspace card carries its sessions' live state: a running session's row shows the ongoing status animation in place of the conversation icon, and a collapsed card shows that animation immediately before the workspace name, because collapsing hides the rows that would otherwise carry it.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web client architecture](../../../docs/subsystems/web-client.md) — client layering and runtime assembly.
- [Filesystem capability seam](../../../.agents/notes/archived/architecture/2026-06-17-filesystem-capability-seam.md) — filesystem ownership and policy.
- [Workspace controller package](../../api/workspace-controller/README.md) — workspace Remote operations.

-----

<a id="model-experience"></a>
## Model Experience

### File preview

#### What the model sees

Nothing directly. Studio preview state is browser-only and does not enter model requests; an in-place save writes the workspace file through the Host Remote, which a later model request sees only as ordinary file content the agent reads or the user references.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent of model request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The preview is bounded and edits only existing text files; it does not create, delete, search, or stream large files.

- **Existing regular files only** — a save replaces a file the session workspace root already contains; creating, deleting, and renaming files needs another tool, and a symlink is refused rather than followed.
- **Saves are version-guarded, not merged** — a file that changed after the buffer was read is refused outright, so the user reloads and reapplies the edit instead of merging.
- **The buffer carries no undo history across files** — the card holds one buffer per open file; closing or replacing the preview drops unsaved text without a prompt.
- **Extension labels are limited** — unknown extensions display as plain text.
- **Directory listings refresh on expand** — opening a folder re-reads it and everything still open beneath it, but a folder that stays open while its contents change keeps showing what it had when it opened, because the browse path has no filesystem watch.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The preview uses the existing editor slot so a future editor can replace the presentation without adding a second composition path, and its edit face is one module (`src/client/preview/edit-face.ts`) over the workspace-file Remote, so a richer editor replaces the line-numbered textarea without touching the frame store.

</details>
