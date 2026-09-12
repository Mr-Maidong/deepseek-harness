# Agent Note: native directory picker serves listing and preview reads

Status: implemented

English | [中文](2026-09-07-directory-picker-native-read-members.zh.md)

## Problem

On macOS the adaptive composition resolves to the native directory picker for an attended loopback host, so the studio file tree's `directoryPicker/list` and `directoryPicker/readText` wires were refused with `directory-picker/unavailable`: the controller demanded the browse kind, and the native capability carried only `pick`.

## Decision

Extend the seam's discriminated union in its merge-extensible direction instead of branching on kind names:

- The native capability (`{ kind: 'native', pick(signal) }`) gains optional read-only `list` and `readText` members beside `pick`; child-directory creation stays browse-only.
- `DirectoryPickerController` serves each generated Remote verb from the member present on the resolved kind, never from the kind name alone — the union is merge-extensible, and a future kind may carry members this controller does not know. A kind that serves no member for a verb answers `directory-picker/unavailable` with the kind in the details.
- Native `readText` bounds the preview to a regular non-symlink file under 1 MiB, matching browse's contract minus browse's realpath containment: that containment rejects every path behind a symlinked ancestor (macOS temp directories) and would reintroduce the same unread on that platform.
- Native `list` no longer fails a whole level on a broken symlink; the probe keeps the row as a file.

## Alternatives considered

- **Dispatch on the kind name in the controller.** Rejected: the union is merge-extensible, so a kind-name switch silently refuses members a future kind already serves; serving each verb from the member present on the kind keeps the controller open to new kinds.
- **Reuse browse's realpath containment in native `readText`.** Rejected: the containment rejects every path behind a symlinked ancestor (macOS temp directories), reintroducing the same unread this change removes.

## Consequences

- The wire exposes generated `directoryPicker/list`, `directoryPicker/readText`, and `directoryPicker/createDirectory` methods with the seam's `directory-picker/*` codes plus `gateway/bad-request`, `gateway/cancelled`, and `gateway/internal`.
- The archived [directory-picker capability seam note](../../archived/architecture/2026-07-28-directory-picker-capability-seam.md) stays the frozen record of the original seam; this note is the current authority for its member set.
