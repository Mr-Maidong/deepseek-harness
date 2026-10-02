# Agent Note: Typert recognizes annotations and boundary types owned by installed packages

Status: implemented

English | [中文](2026-10-02-typert-installed-package-ownership.zh.md)

## Problem

A package outside this workspace could not publish [Typert Remote](../../../../docs/subsystems/typert.md) artifacts, so an external plugin had to keep a twin package inside the workspace to be buildable at all.

Recognition keyed on the generator's own registration set. `loadRegistrations()` keeps only packages under `<root>/packages` that a face aggregate references through `projectReferences`, and `isTypeMetaSymbol()` accepted `@Remote`, `TypertRemoteService`, and `bindTypertRemote` only when the declaring file resolved to a registration named `@deepseek-ai/dsh-typert-protocol`. An installed dependency resolves its declarations from `node_modules`, which no registration covers, so neither the decorators nor a boundary type such as `PluginEntryId` from `@deepseek-ai/dsh-host-plugin-inventory/types` was recognized. `WorkspaceTypertGenerator` then failed with `publishes Remote artifacts but has no Remote methods` and never emitted `lib/typert.remote-client.*`, which left the package's `./remote` export unresolvable for its Client program.

## Decision

Declaration ownership is resolved per file in two steps: the workspace registration covering the file, otherwise — for a file inside `node_modules` — the nearest ancestor `package.json`. That installed lookup is cached per package root, and a repository directory outside `node_modules` never becomes an owner.

`isTypeMetaSymbol()` accepts the protocol decorators when the owning manifest is `@deepseek-ai/dsh-typert-protocol`. The Remote boundary path — [`remoteBoundary()`'s import visit](../../../../packages/typert/generator/src/analyzer.ts), `namedOwnedType()`, and `publicRemoteType()` — accepts any owning package. A workspace owner still resolves its export target through `sourcePathForExport()` to the source plane, while an installed owner resolves the target its manifest names (`lib/types/x.d.ts`) directly, because installed packages ship no `src/`. The requirement that a boundary type come from a public non-root type subpath is unchanged.

Generation scope is untouched: `analyze()` still iterates only the registrations the face aggregates reference, so an installed package contributes no artifacts and the generated Cordis catalog output is unchanged. Vendored trees keep no owner, because [`installedPackageRoot()`](../../../../packages/typert/generator/src/analyzer.ts) only accepts a path that contains a `node_modules` segment.

## Alternatives considered

**Require the plugin to keep an in-repo package.** This is the state the change removes: a plugin published from its own repository could not build its Remote artifacts, and every workspace package would keep a second, drift-prone copy of the plugin's source.

**Vendor the protocol declarations into the plugin.** Vendoring copies the decorator signatures and the merge-extensible `TypertRemoteMap`/`TypertRemoteNamespaceMap` interfaces, so the plugin's Remote namespaces stop merging into the protocol the Host Gateway reads. It also leaves boundary types from unrelated dependencies unresolved.

**Accept any nearest package manifest, including repository directories.** The wider rule would let `apps/`, `scripts/`, or a vendored tree claim ownership of a declaration the generator must not treat as a package boundary, and it would widen recognition far beyond the reported failure. Restricting the fallback to installed paths keeps the blast radius to dependencies, which the compiler program already resolves.

**Resolve the protocol by package name alone, without walking manifests.** A name check needs the manifest that declares the name, so this only relocates the walk. It also cannot serve the boundary path, which needs the owning package's export map and root to build an import specifier.

## Consequences

An out-of-repo plugin builds with the published generator layout: Remote decorators and boundary types exported from a dependency's non-root type subpath resolve, and `lib/typert.host.*` plus `lib/typert.remote-client.*` land at the package output root.

The published generator must carry this change before an external plugin can build from npm; until a release does, such a plugin builds against a linked workspace checkout. A boundary type declared in an installed package whose manifest has no `name` stays unrecognized rather than failing the analysis.

Verification lives in [`packages/typert/generator/tests/remote-model.spec.ts`](../../../../packages/typert/generator/tests/remote-model.spec.ts): it copies the fixture, installs a protocol package and a boundary-type package under the copy's `node_modules`, and asserts the emitted Remote JavaScript and the emitted declaration's import of the installed package. A third case pins that a nameless installed manifest contributes no import. The first two cases fail against the previous ownership rule.
