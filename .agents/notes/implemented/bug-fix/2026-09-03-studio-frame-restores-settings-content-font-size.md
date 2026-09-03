# Agent Note: Studio frame restores the Settings-driven conversation font size

Status: implemented

English | [中文](2026-09-03-studio-frame-restores-settings-content-font-size.zh.md)

## Problem

The Studio layout's `.frame` re-declared the full `--dsw-font-markdown-*` ladder — headings, base, table, small, code, and code-block roles with their px sizes — plus the `--dsh-conversation-*` font tokens (`turn-status-font`, `turn-status-clock-font`, `user-font-size`) and the `--dsh-conversation-*` background tokens (`fade-bg`, `scroll-bg`). The conversation seat and the workbench's markdown render as `.frame` descendants, and CSS custom properties resolve from the nearest defining ancestor, so those frozen px values shadowed the body-level adaptive ladder from ui-theme's `gradient-shadow-text.css`, which derives from `--dsh-content-font-size`. The Appearance setting's font-size preference therefore stopped controlling conversation text inside the Studio layout even though the value still reached `document.body`.

The studio's `ThemePresenter` copy also predated the ui-layout presenter's content-font-size axis: it projected color-scheme, the dark attribute, and alias tokens but never wrote or retracted `--dsh-content-font-size`, so live font-size changes from the Appearance row had no presenter to repaint the body axis under the Studio composition (the shipped ui-layout entry is disabled there).

## Decision

- `.frame` no longer defines any markdown ladder or conversation font tokens. Its descendants resolve the body-level adaptive ladder, so the Settings font-size preference again controls conversation text; the frame's own `--dsw-font-family: 'YaHei Consolas Hybrid', monospace` re-declaration (identical to `ui-theme`'s `:root`) keeps the studio face without freezing sizes.
- The studio `ThemePresenter` gains the ui-layout presenter's `CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'` write in `apply` and retraction in `dispose`, keeping the two copies behaviorally aligned for the axis the Studio composition owns (ui-layout is disabled there).

## Alternatives considered

**Rebase the frozen ladder onto the delta variables** (e.g. `calc(15px + var(--dsh-content-font-delta))`) instead of deleting it. Rejected: it keeps a second copy of a ladder ui-theme already owns, and every future ladder edit (the adaptive feature's own h1–h4/base/table adjustments) would need to be mirrored or drift again. ui-layout's reference `AppFrame.module.css` defines none of these tokens — the studio shadowing was never a shipped contract.

## Consequences

- Conversation and workbench markdown inside the Studio frame follow the Settings font size (12–17) exactly like the rest of the surface, including the shared px deltas for headings and secondary text.
- The frame's base conversation font moves from the frozen 15px to the adaptive default 14px (`--dsh-content-font-size`'s default), matching the rest of the browser UI at the default setting.
- The removed `--dsh-conversation-*` tokens had no consumers anywhere in the tree (grep across source for all five returned only the frame definitions), so nothing else regresses.

## Testing

`packages/client/ui-studio/tests/theme-presenter.client.spec.ts` pins the presenter's font-size axis: apply publishes `--dsh-content-font-size` in px and follows a changed snapshot value, and dispose retracts the axis while sparing foreign inline styles.
