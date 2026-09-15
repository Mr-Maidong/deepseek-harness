# Agent Note: Chat file clicks open in Studio's universal preview card

Status: implemented

English | [中文](2026-09-15-studio-chat-file-opener.zh.md)

## Problem

In the Studio composition, clicking a file link in the chat window — a tool row's path link, a produced-file chip, or a closing-message mention — opened the file in the right Sidebar. Studio already has a universal preview card (`PreviewCard` anchored above the composer bar through `studio.center.editor`) that shows source code with line numbers and embeds rendered artifacts, but chat file gestures bypassed it entirely. Users had to switch attention between the conversation column and the right Sidebar instead of seeing files inline where the conversation produced them.

## Decision

A new optional service seam `chatFileOpener` (declared as `ChatFileOpener` in `ui-chat/src/client/contract/slots.ts`) lets a layout own the chat file-open gesture. ui-chat reads it through `ctx.get('chatFileOpener')` — never injected, so no activation-order coupling — and falls back to its existing right-Sidebar route when no provider exists. Studio provides the service in its root entry's effect, wiring every chat file gesture into the same `bridge.require()` publication channel the file tree and header search already use. The opener resolves relative paths against the viewed Session's workspace root via `resolveWorkspacePath`, publishes the loading → ready/error flow with an optional focus line (the same channel a search jump uses), and rejects with the original reason so the chat view's open-error dialog surfaces failures unchanged.

The seam is declared in ui-chat's contract module alongside `ChatFileMentions` and registered in `scripts/gen-cordis-catalog.ts`'s `SERVICE_WALK_EXEMPTIONS` as a client-side context key owned by ui-chat's README. ui-studio adds `@deepseek-ai/dsh-client-ui-chat` and `@deepseek-ai/dsh-util-workspace-path` as devDependencies and tsconfig references; the type-only import is erased at build time and needs no `dsh.client.external` declaration.

## Alternatives considered

**Inject `sidebarRight` into ui-studio and have it call `openResource`.** Rejected: this would couple Studio to the Sidebar package's activation order and make Studio unusable without the Sidebar composed in. The seam direction is reversed — the layout provides, the consumer reads — so either side composes out cleanly.

**Add a slot-based registration for the file opener.** Rejected: the gesture is a service call, not a rendered component. Slots are for UI composition; services are for behavior ownership. The existing `chatFileMentions` optional-service pattern is the exact precedent.

**Hard-code the Studio preview publication inside ui-chat.** Rejected: ui-chat must remain layout-agnostic. The same package serves both the standard web layout (which has no universal preview card) and Studio; hard-coding would break the non-Studio composition.

## Consequences

- Every chat file gesture in the Studio composition now opens in the universal preview card above the composer bar, keeping file content inline with the conversation that produced it.
- Non-Studio compositions are unaffected: ui-chat falls back to the right Sidebar when `ctx.get('chatFileOpener')` returns undefined.
- Line-number navigation is preserved: tool rows that pass `{ line }` land the card on that line through the existing `focus` mechanism.
- The opener reuses the same bounded read (`uiWorkspace().readFile`) and frame-store publication as the file tree and header search, so all three producers share one identity for the same file.
- No new locale keys, store fields, persistence-format versions, or session events changed — the seam is pure behavior routing.

## Testing

`packages/client/ui-chat/tests/apply-inject.client.spec.tsx` adds two cases: one verifies the opener receives `(sessionId, path, line)` and the Sidebar stays silent when provided; the other verifies a rejection propagates through the injected promise while the Sidebar stays silent. The existing Sidebar-fallback case keeps passing unchanged. `packages/client/ui-studio/tests/chat-file-opener.client.spec.ts` covers the opener's six behaviors: relative-path resolution, absolute-path passthrough, focus-line propagation, missing-language omission, read-failure error state plus rejection, and missing-workspace-root refusal. All 497 tests across ui-chat and ui-studio pass; deliverables, tool, and primitives suites (1277 tests) pass unchanged.
