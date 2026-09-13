# Agent Note: the studio preview card opens workspace files as an editor

Status: implemented

English | [中文](2026-09-12-studio-preview-in-place-edit.zh.md)

## Problem

The studio's floating preview card showed a bounded read of one workspace file, and every other preview in the product was read-only too. No browser-to-Host write existed for workspace files at all: `workspaceFiles` served `read`, `readBytes`, `readAll`, `readRelated`, `stat`, `list`, and the observation feed, and its own module doc stated that the service exposed no mutation. Changing a file the card displayed meant leaving the card for an external editor or asking the agent.

## Decision

Add one guarded write to the existing workspace-file capability, and an edit mode to the card:

- `workspaceFiles.write(scope, path, { text, version? }, signal)` replaces the complete text of one existing regular file inside the Session's workspace root. It publishes through `ctx.fs.writeText`, so the backend writes atomically; it returns the file's `WorkspaceFileStat` with the version the write produced; and `maxFileBytes` bounds the complete new text.
- Writes are deliberately narrower than reads. A read may address any path the filesystem backend can read, `readRelated` included; a write additionally requires workspace containment through the existing `confine` helper and a final component that is already a regular file, so a symlink is refused rather than followed and no file is created.
- `version` is the guard. The card opens a source file directly as a line-numbered editor — there is no read/edit mode toggle — reading its buffer through `readAll`, which carries the version the content was read at, and sending that version back; a file that changed since is refused with the new `workspace-file/version-conflict` error, mapped from the filesystem's `FS_STALE_VERSION`, so merging stays the user's decision. Omitting `version` overwrites unconditionally for callers that mean it.
- The edit face resolves the Session from the Session list on every call and waits for a list that has not arrived, because the frame store restores the card on a page reload before that list exists; a list that arrives without a selected Session fails the read instead of waiting forever. The card keeps the buffer as component-local state, takes the caret when the buffer opens (and again for the next file), saves on `Ctrl+S` or the Save control, keeps the buffer and offers a reload when a conflict refuses the write, keeps the version the write produced so the next save stays guarded, asks the frame to re-read the file so the store's content and language label stay one source of truth, and suppresses the browser's context menu so that gesture stays free for the card's own actions.

## Alternatives considered

- **Write through the directory-picker backends.** Rejected: that capability is the directory-picking interaction — host paths, no Session workspace root, no version tokens. The workspace-file service already owns the Session lookup, the containment helper, and the version-carrying reads.
- **Add a new capability package for writes.** Rejected: scope resolution, containment, caps, and version reporting all exist in `workspaceFiles`; a second seam would duplicate the lookup and split workspace-file policy across two packages.
- **Save unconditionally, without a version.** Rejected as the card's behavior: the agent writes the same files, so an unguarded save would silently clobber a change the user never saw. The verb still permits it explicitly.
- **Add create, delete, and rename in the same verb.** Deferred: the card needs in-place editing, while creation and deletion need their own gates and a product decision about path choice.
- **Use a `contenteditable` surface or a third-party editor.** Deferred: a monospace textarea keeps the card dependency-free, and the edit face is one module, so a richer editor replaces the textarea without touching the store or the slot.

## Consequences

- `@deepseek-ai/dsh-fs` becomes a peer-required Host dependency of `dsh-api-workspace-files`, because the stale-version mapping uses `FsError` identity and `FsVersion`; both are classified in `scripts/package-dependency-policy.ts`.
- The service's module doc, the web-app bundle row comment, and both package READMEs now describe the guarded write; the studio README records that saves are version-guarded rather than merged and that only existing regular files are editable.
- The card's editor is covered by component specs (automatic buffer read, dirty guard, `Ctrl+S` and Save, in-flight suppression, conflict with reload, refused and rejected writes, failed read with retry, read-only degradation without an edit face, a replaced preview, a read that settles after unmount, and the suppressed context menu), and the edit face by its own spec (Session wait, arrived-but-unselected Session, a store that publishes while subscribing, version conflicts), and the Host verb has its own spec for containment, symlinks, missing files, the byte cap, the stale version, and atomic replacement.
- A save does not enter the Session log by itself; it reaches a model request only when the agent reads the file or the user references it, which is the same contract an external editor has.
