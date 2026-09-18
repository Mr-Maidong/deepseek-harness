# Agent Note: Studio preview card plays workspace media and refuses binaries

Status: implemented

English | [中文](2026-09-18-studio-media-preview.zh.md)

## Problem

Studio's universal preview card classified every path as `code` or `iframe` ([the card decision](2026-09-03-studio-universal-preview-card.md)). An image or a video in the workspace therefore had no surface of its own: the click reached the bounded text read, which accepts UTF-8 text under its own byte bound, so a picture rendered as source with replacement characters or failed on size, and a produced video could not be watched from the card at all.

The same read is wrong for the rest of the binary workspace. An archive, a PDF, a font, or an audio file is not text either, and the read either shows mojibake or refuses the file — after pulling up to the byte bound across the wire. The card needed to say what it cannot show, and to decide that before reading.

## Decision

`frame/contract.ts` owns the classification, and `preview/open-preview.ts` owns the publication flow every producer calls — the file tree, the header search, and the chat opener — replacing their three copies of the same read-and-publish sequence.

- `mediaFileType(path)` maps an extension to `{ kind: 'image' | 'video', mediaType }`. The table holds what the browser decodes or plays: `png jpg jpeg gif webp avif bmp ico svg`, and `mp4 m4v mov webm mkv`. An SVG is an image, matching the sidebar document preview, so it reaches the browser only as an `img` element's blob URL and scripts inside it never run.
- `isUnsupportedBinary(path)` covers formats with no surface: archives and packages, executables and object files, PDF and Office documents, fonts, audio, and the image and video containers no browser decoder accepts. `ts`, `rtf`, and the ambiguous `dat`/`img` suffixes stay out, because a source buffer is a better preview than a refusal.
- `previewKindFor(path)` answers media first, then `'binary'`, then `textPreviewKindFor(path)` for the readable kinds. A media path publishes one `ready` state carrying its path and media type and is never read by the producer; a refused binary publishes one `error` state with kind `'binary'`; the readable kinds keep the `loading → ready/error` flow, with `focus` for source only.

The card reads media bytes itself. `preview/media-face.ts` builds `loadMedia` over `workspaceFiles.readAll`, the Remote the edit buffer already uses, because those bytes must not enter the frame's persisted preview store: the store is one `localStorage` JSON document (`dsh.studio.layout.v1`), where a picture would exhaust the quota and take the card's geometry with it. The store keeps the path and media type only. The card plays the bytes from one `blob:` URL it revokes when the path changes or the card unmounts, as an `<img>` or a `<video controls playsInline preload="metadata">`, and a read it has moved on from writes nothing and mints nothing. `preview/session-selection.ts` holds the Session resolution both card faces use, so a media card restored from browser storage waits for the Session list instead of reporting a failure.

A text read that decoded invalid bytes (`\uFFFD`) under an extension neither table knows reclassifies to the binary refusal rather than showing mojibake; reading no bytes beforehand is what keeps that check cheap, and it is the only detection available for an extension the tables miss.

The refusal and the media failures are card-local. The producers resolve, so the chat view's open-error dialog stays closed for them, and the card reports `preview.binaryUnsupported`, `preview.mediaTooLarge` for `workspace-file/too-large`, or `preview.mediaFailed`; the reload control the edit conflict already used is the media retry. `preview.image` and `preview.video` name the region, and the image's alt text names the file.

## Alternatives considered

**Add media only, leaving other binary formats alone.** Rejected: the garbled source and the oversized read are the same gap for every binary format, and the extension table media needs already distinguishes them.

**Serve media through the Host's `/api/file` HTTP route.** Rejected: it serves under an image byte limit, supports no range requests (a player would fetch the whole file anyway), needs an http(s) page (Electron's `file://` has none), and bypasses the Session workspace resolution the README's Host/Remote read contract promises.

**Keep media bytes or their blob URL in the preview store.** Rejected: the store is one persisted JSON document, so bytes break its quota and a blob URL does not survive a reload.

**Have each producer read the bytes and publish them.** Rejected: three producers would duplicate the read, and the persisted publication fails on quota one step earlier.

**Sniff every path by reading bytes first.** Rejected: text previews are bounded for a reason, and moving them to whole-file byte reads would pull large source files across the wire and lose the language label the workspace service derives. The `\uFFFD` check after the ordinary read covers an unknown extension for free.

**Decode audio in the same change.** Deferred: `mp3`, `wav`, and the rest sit in the refusal table until the card owns a player surface for them.

## Consequences

- An image or video click opens a read-only player: the picture scales down to the card and never up, the video plays inline with controls, and both are revoked when the card moves on. An SVG loses in-place editing, which is the price of rendering it.
- Media is read whole, bounded by the Host's complete-file cap rather than a stream or a range request, and the browser holds the base64 text, the decoded bytes, and the blob at once. A file past the cap says so and offers a retry that cannot succeed.
- Binary formats are refused before any read, so no bytes move and no mojibake appears; an extension neither table knows still costs one bounded text read before the refusal.
- `StudioPreview`'s ready state has three members now (`code`, `iframe`, and the media pair), and `kind` gained three values.
- No slot, store field, persistence version, or session event changed, and the preview store gained a path and a media type rather than bytes.
- Chat gestures on media and refused binaries resolve instead of rejecting, so their failures appear on the card and not in the chat open-error dialog.
- The tree and the search no longer carry their own read-and-publish copies; the shared flow has one implementation and one spec.

## Testing

`preview-kind.client.spec.ts` pins the classification, the deliberate text suffixes, and that the media and refusal tables stay disjoint. `preview-media-face.client.spec.ts` covers the decode, the cap reason, another refusal, the pending Session list, and an arrived list with no selection. `preview-media.client.spec.tsx` covers the blob URL lifecycle (mint, revoke on a new path, revoke on unmount, no URL for a late settle), the retry, a read that rejects, a refusal from a read the card has moved on from, an element that cannot decode, an unwired face, a media path that never resolved, and the binary refusal. The chat opener, file-tree, and header-search specs assert that a media or refused path publishes one state and never calls the text read; `preview-edit-face.client.spec.ts` keeps covering the shared Session resolution. `pnpm exec vitest run packages/client/ui-studio` passes, and every changed source file is at 100% in the package's coverage lane.
