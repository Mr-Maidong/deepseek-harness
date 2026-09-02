# Agent Note: Studio file-tree preview

Status: implemented

English | [中文](2026-08-25-studio-file-tree-preview.zh.md)

## Problem

Studio users need to inspect source files selected from a Host-provided workspace listing without editing files or granting the browser direct filesystem access.

## Alternatives considered

Direct browser filesystem access was rejected because it would bypass Host path and size enforcement. A general-purpose editor was deferred because this feature only requires a bounded, read-only preview.

## Decision

The directory-picker browse capability reads bounded UTF-8 text through its Host Remote. The Client workspace service preserves the exact Host-listed path and derives a display language from its extension. Studio renders file entries as keyboard-accessible buttons and sends a status-carrying preview through the owner callback into the central read-only editor slot: the click publishes the `loading` state immediately, and the settled read replaces it with `ready` (content plus language) or `error`. The tree keeps rendering throughout; only the floating card shows the read state.

The Host owns path checks, file-kind checks, byte limits, and cancellation. The browser owns presentation and localization. The preview does not write to the filesystem or enter the session log.

## Consequences

Unsupported extensions display as plain text. The reading and failure states render inside the floating card, so the tree never swaps itself for a placeholder and stays interactive while a read is in flight. A future editor must register through the existing `studio.center.editor` slot rather than adding a second cross-package rendering path.

## Verification

Focused TypeScript checks, the directory-picker Host suite, and package bundles were run during implementation. Full GUI, Web replay, documentation, and live GUI checks remain required before release.
