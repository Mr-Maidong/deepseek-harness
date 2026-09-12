# Agent Note: studio boot deadlock between the layout provider and its uiWorkspace injection

Status: implemented

English | [中文](2026-09-12-studio-layout-provider-activation-cycle.zh.md)

## Problem

`pnpm dsh web --patch packages/client/ui-studio/studio-suite.patch.yml` failed with `web boot: 14 entries did not activate` once ui-workspace began injecting `layout`. The studio composition disables ui-layout, and ui-studio's apply provides the replacement `layout` service — but the ui-studio fiber's inject list waited on `uiWorkspace`, which ui-workspace only provides after its own `layout` injection resolves. Each fiber waited on a service the other gated, so neither activated, and every downstream consumer (`uiConversation`, `sidebarRight`, `sidebarRightTabs`) piled up behind the pair.

## Decision

Drop `uiWorkspace` from ui-studio's fiber inject list and resolve it through `ctx.get('uiWorkspace')` inside the four callbacks that use it (`readFile`, `startSession`, `archiveSession`, `listDirectory`). Every caller is a post-activation UI gesture, so nothing needs the service at activation time; the resolver throws loudly when the service is not composed. The general rule: a plugin that provides a service from apply must not gate its fiber activation on a consumer of that service.

## Alternatives considered

- **Move the `layout` provide into a separate studio entry that injects nothing.** Rejected: it would split one plugin's assembly across two bundle rows and two fibers for a single service; lazy resolution inside the existing apply keeps the assembly in one place.
- **Make ui-workspace's `layout` injection optional.** Rejected: it would weaken a shipped package's contract to accommodate one overlay, and the studio is the side that owns the replacement provider.

## Consequences

- ui-studio activates on infrastructure services alone (`slots`, `theme`, `locale`, `sessions`, `workspaces`, `remote`, `remote.workspace`), provides `layout`, and the rest of the composition follows.
- `apps/web/tests/studio-suite-boot.e2e.ts` boots the real built bundles through the studio overlay and asserts the rendered frame, so a reintroduced activation cycle fails the lane instead of the product boot. The assembled-boot harness gained an `overlays` option for composing extra `--patch` files.
