# Agent Note: Settings nav glyphs are a slot, not a shell-owned id map

Status: implemented

English | [中文](2026-10-03-settings-section-nav-glyph.zh.md)

## Problem

The settings navigation drew every row's glyph from a private `navIcon(id)` map inside ui-settings-general, so a section contributed by a plugin outside this workspace could only inherit the fallback gear, and giving it its own artwork meant editing harness source with a package the harness does not ship. The nav cell belongs to the shell (the `sidebar.settings` occupant) rather than to the section, so a section's own registration has no render location to draw into, and ReactNode cannot reach it through `settings.section` owner props or its inject face.

## Decision

`settings.section.icon` is a root-scoped `list` slot declared by the shell's `sidebar.settings` registration and typed in [`ui-settings/src/client/contract/slots.ts`](../../../../packages/client/ui-settings/src/client/contract/slots.ts) with the other settings slot types. A contribution addresses one nav row by registration id: the id equals the section id it draws for, while the slot itself takes no owner props, because a glyph needs nothing the shell knows.

The shell renders the slot per row through `renderSlot('settings.section.icon', {}, { only: row.id })` inside a shell-owned `span` carrying the `.navIcon` box, so the cell keeps glyph geometry and `currentColor` inherits the nav cell's text color. The shipped glyphs draw at 16×16 in `currentColor`, and a contribution carries no copy and matches that size.

The shell keeps `navIcon(id)` as the fallback for every row without a contribution, so the sections that ship inside this repository (`account`, `models`, `agent-presets`, `plugins`, `archived-sessions`, and the settings gear for every other id) draw what they drew before, and a section that contributes no glyph still gets a working one.

The projection in [`ui-settings-general/src/client/index.ts`](../../../../packages/client/ui-settings-general/src/client/index.ts) reports the glyph fact on each row as `SettingsSectionRow.hasIcon` and rides the icon ledger as a third cache-key and subscription source beside the section ledger and the locale revision. A row therefore takes up its contributed glyph as soon as a plugin registers, and the component still receives plain projected rows instead of subscribing to the ledger.

A plugin contributes its glyph through `ctx.slots.inject('settings.section.icon', …)`, so a plugin composed against a shell that does not yet declare the slot stays pending rather than failing to load, and its contribution leaves with the declaration.

## Alternatives considered

**Hardcode the section id in the shell's `navIcon` map.** The harness would carry the artwork and id of a plugin it does not ship, and every new outside section would need a harness edit and a rebuild of the shipped app.

**Carry the glyph as a field on `settings.section` registrations.** Owner props, injected values, and store state accept JSON-compatible data and callbacks; registered ReactNode content travels through a slot, so a glyph field could only hold a component reference, which is neither a permitted value nor composed by the renderer.

**Hold the active row's glyph in a `single` slot.** The nav renders every row at once, and a `single` slot has one occupant, so it could serve only the active section.

**Declare a `keyed` slot with the section id as `entryKey`.** Equivalent addressing through a second key namespace; the `list` cardinality with `only` filtering is already the mechanism `settings.section` uses at the same render site.

**Let each section declare its own glyph slot.** A slot renders only where its declaring entry renders it, and a section's registration does not render the nav cell; per-section declarations would also leave the shell's single render site undeclared for every other section.

**Migrate the in-repo sections to contributions and delete `navIcon`.** It moves ui-primitives imports and locale-independent artwork out of the shell for no consumer benefit, and a section without a contribution would then have no glyph at all.

## Consequences

Any Client plugin composes a settings section with its own nav glyph without a harness change, and the harness holds no plugin id or artwork. A contribution whose id matches no registered section is inert, because no row carries that id.

The generated Client slot catalog (`pnpm run gen-client-catalog`) lists the slot for plugin authors, and [`docs/subsystems/slots.md`](../../../../docs/subsystems/slots.md) carries it in the slot tree.

Verification: [`settings-root.client.spec.tsx`](../../../../packages/client/ui-settings-general/tests/settings-root.client.spec.tsx) renders rows with and without a contribution and pins that the contributed row draws the contribution and no built-in `svg`; [`shell.client.spec.ts`](../../../../packages/client/ui-settings-general/tests/shell.client.spec.ts) pins the child declaration, the `hasIcon` projection over the icon ledger, and the stable-snapshot contract.
