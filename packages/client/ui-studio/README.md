---
description: "Studio workspace navigation and read-only source preview for users and maintainers composing the web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studio

English | [中文](README.zh.md)

## Summary

Studio provides a three-column workspace for navigating sessions, browsing the current workspace, previewing bounded text files, and managing project todos. Choose it when the web client needs an editor-style surface with a read-only file preview. File reads stay on the Host/Remote path and never grant the browser direct filesystem access.

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

Mount Studio when the web client needs workspace navigation, a file tree, a read-only source preview, and a project workbench.

### When to choose it

Choose Studio for an editor-style layout. Choose the lower-level workspace package when another layout owns the presentation.

### Minimal configuration

The package is loaded by the Web composition and has no user-configurable fields. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for accepted configuration fields.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host directory-picker browse capability validates and bounds text reads. The workspace Client service maps the result to a preview with an extension-derived language label. A file click publishes a status-carrying preview (`loading` → `ready`/`error`) through the owner callback, so the floating card shows the read state itself while the tree keeps rendering. StudioFrame owns preview state and renders PreviewCard anchored above the composer bar through `studio.center.editor`; the card is a kind-driven universal container (`code` shows source, `iframe` embeds rendered artifacts such as produced HTML in a sandboxed frame). File rows use Host-listed paths unchanged. Expanding a folder re-reads it, and opening one re-reads every folder still held open beneath it, so a collapsed subtree comes back with the directory's current contents; a failed re-read keeps the rows already on screen.

A source file renders as the file text beside a line-number gutter whose numbers mark the search hit and the lines the "insert reference" bubble quotes; clicking a number quotes exactly that line. The reading, failure, and embedded-artifact states carry no gutter, and the numbers stay out of copied selections.

Workspace search lives in the conversation titleRow's rightmost utilities seat (`conversation.session.header.utilities`): a search trigger opens a floating results panel right-aligned under it, styled with the universal preview card's `--studio-*` token language and portal-mounted into the studio frame node, backed by the Host ripgrep plain-text search (`remote.workspace.search`). The query is debounced, Enter searches immediately, and a monotonic request id plus an AbortController keep only the latest request's result. Result file paths are fully qualified host paths, the same identity the file tree and the bounded read use; the panel labels them relative to the workspace root. Clicking a match publishes the same preview flow (scrolled to the match line/column) and closes the panel. The header entry resolves the Session's workspace at registration time and publishes previews through a root-entry bridge into the frame's exclusive preview store — a Session-scoped registrant cannot declare a root-scoped store.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web client architecture](../../../docs/subsystems/web-client.md) — client layering and runtime assembly.
- [Filesystem capability seam](../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.md) — filesystem ownership and policy.
- [Workspace controller package](../../api/workspace-controller/README.md) — workspace Remote operations.

-----

<a id="model-experience"></a>
## Model Experience

### File preview

#### What the model sees

Nothing. Studio preview is browser-only state and does not enter model requests; the `studio.center.editor` slot receives it only for browser rendering.

#### Token effect

Zero direct tokens.

#### KV Cache effect

Independent of model request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The preview is intentionally read-only and bounded; it does not edit, search, or stream large files.

- **No editing** — users can inspect content but must use another tool to modify files.
- **Extension labels are limited** — unknown extensions display as plain text.
- **Directory listings refresh on expand** — opening a folder re-reads it and everything still open beneath it, but a folder that stays open while its contents change keeps showing what it had when it opened, because the browse path has no filesystem watch.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The preview uses the existing editor slot so a future editor can replace the presentation without adding a second composition path.

</details>
