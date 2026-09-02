# Agent Note: Studio file-tree expansion persistence

Status: implemented

English | [中文](2026-08-28-studio-file-tree-expansion-persistence.zh.md)

## Problem

The Studio file tree kept its expanded-folder state in component-local `useState`, so every page refresh collapsed every directory and dropped the loaded child listings. Navigating back to the same workspace cost the user a fresh unfold each time.

## Alternatives considered

Local-only state with no persistence was the status quo and the defect itself. Persisting through the existing layout store was rejected because that store is declared for the frame entry, while the tree lives in the `studio.workspace` entry; sharing a frame-owned handle across entries would couple two registrations to one instance.

## Decision

The tree's expansion becomes a root-scoped persisted store declared on the `studio.workspace` entry (`createFileTreeStore`, key `dsh.studio.file-tree-expanded.v1`). It holds `expandedPaths: string[]` in toggle order — a JSON-serializable array, because a `Set` would not survive `attachPersistence`'s whole-value JSON write. `LeftPanelMain` reads the paths through `useStore` and writes through `actions.toggleExpanded`; `FileTree` becomes a controlled component receiving `expandedPaths` and `onToggleExpanded` as plain props. Child listings stay in the component's ref cache, keyed by path, so an already-loaded directory renders immediately on re-expansion without a second network read.

## Consequences

Expanded folders survive reloads and remounts for every workspace, because paths are workspace-agnostic absolute paths. The tree's render stays pure: all mutable expansion state flows through the declared store's actions. A `Set`-shaped future consumer must convert to the persisted array shape at the store boundary.

## Verification

Store tests cover toggling a path in and out and rehydrating the expanded paths into a fresh instance from `localStorage`. Component tests drive a folder toggle through the callback and render the store-driven expanded children. The ui-studio suite, its typecheck, and its bundle all pass.
