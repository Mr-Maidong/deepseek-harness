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

The Host directory-picker browse capability validates and bounds text reads. The workspace Client service maps the result to a preview with an extension-derived language label. A file click publishes a status-carrying preview (`loading` → `ready`/`error`) through the owner callback, so the floating card shows the read state itself while the tree keeps rendering. StudioFrame owns preview state and renders CodePreview anchored above the composer bar through `studio.center.editor`. File rows use Host-listed paths unchanged.

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

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The preview uses the existing editor slot so a future editor can replace the presentation without adding a second composition path.

</details>
