# Agent Note: Persisted store rehydration backfills fields added after the stored JSON was written

Status: implemented

English | [中文](2026-08-28-client-store-rehydration-init-backfill.zh.md)

## Problem

A persisted snapshot store whose state type gained a top-level field after a previous build wrote its JSON to `localStorage` rehydrated into an object missing that field: `attachPersistence` replaced the fresh initial state with `JSON.parse(raw)`, so components reading the new field through `useStore` crashed on `undefined` (a Studio `LeftPanelMain` crash reading `sections.workBase` after the file-tree store added `sections`). TypeScript could not catch it because the field is non-optional in the state type while the persisted JSON predates it.

## Alternatives considered

**Bump the persisted key** (e.g. `dsh.studio.file-tree-expanded.v1` → `.v2`). Rejected as the general fix: it discards user data held under the old key and leaves the same crash latent for every future additive state change, so each one would need its own migration ceremony.

**Deep-merge the stored JSON over init.** Rejected: nested values are stored wholesale, and guessing a merge depth would resurrect stale nested fields or silently keep half-migrated objects. Schema deepening stays the state owner's concern, handled by its init structure or a new persisted key.

## Decision

`attachPersistence` now receives the store's initial state and rehydrates through a `rehydrate(stored, init)` overlay for plain-object roots: stored top-level fields win, fields absent from the stored JSON resolve to their init values. Scalar, array, and null roots rehydrate whole, preserving the hand-rolled whole-value contract that avoids the zustand persist spread corruption. The engine's JSDoc and the rehydration tests document the boundary: backfill covers top-level fields only.

## Consequences

- Adding a top-level field to a persisted store's state is now safe for values written by older builds; the field appears with its init default until the next write.
- Existing stored values keep every field they carry; nothing is dropped or reset by rehydration.
- The change is invisible to stores whose state shape never grows.

## Testing

`packages/client/store/tests/store.client.spec.ts` covers the persisted/rehydrate pair, fills fields added after the stored JSON was written from init, rehydrates a scalar root whole when the stored JSON predates the current type, and keeps the failure-reporting paths. The reproduction scenario (older JSON lacking `sections`, new store declaring it) was verified against the rebuilt `lib/index.js`.
