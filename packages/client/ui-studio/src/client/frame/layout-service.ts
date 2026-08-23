/**
 * The studio layout's panel-action face behind `ctx.layout` (the same
 * contract ui-layout's LayoutController served): ui-sidebar and
 * ui-conversation inject this service at runtime, so a composition that
 * replaces ui-layout's root entry must keep the face alive. The studio maps
 * the sidebar toggle onto its left rail (the store's `toggleLeft`) and treats
 * details transitions as no-ops — this layout has no details column.
 */
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'

/** The studio layout's panel-action face behind ctx.layout (see {@link ILayout}). */
export class StudioLayout implements ILayout {
  #toggleLeft: (() => void) | undefined

  /**
   * Adopt the root entry's bound left-toggle. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render.
   * @param toggleLeft - the store's bound left-rail toggle.
   */
  attachToggle(toggleLeft: () => void): void {
    this.#toggleLeft = toggleLeft
  }

  /** Toggle the left rail (the studio's sidebar equivalent). */
  toggleSidebar(): void {
    this.#require().toggleLeft()
  }

  /** No-op: this layout has no details column; ui-conversation's panel has nowhere to open. */
  openDetails(): void {}

  /** No-op: this layout has no details column. */
  closeDetails(): void {}

  #require(): { toggleLeft: () => void } {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#toggleLeft === undefined) {
      throw new Error('studio layout: panel actions not wired (root entry not mounted)')
    }
    return { toggleLeft: this.#toggleLeft }
  }
}
