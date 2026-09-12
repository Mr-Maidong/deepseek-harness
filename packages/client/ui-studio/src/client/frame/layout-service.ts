/**
 * The studio layout's panel-action face behind `ctx.layout` (the same
 * contract ui-layout's LayoutController served): ui-sidebar and
 * ui-conversation inject this service at runtime, so a composition that
 * replaces ui-layout's root entry must keep the face alive. The studio maps
 * the sidebar toggle onto its left rail (the store's `toggleLeft`), always
 * shows the Conversation panel, and treats right-column transitions as
 * no-ops — this layout has no rightbar column.
 */
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** The studio layout's panel-action face behind ctx.layout (see {@link ILayout}). */
export class StudioLayout implements ILayout {
  #toggleLeft: (() => void) | undefined
  #navigation = new AbortController()

  /**
   * Adopt the root entry's bound left-toggle. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render.
   * @param toggleLeft - the store's bound left-rail toggle.
   */
  attachToggle(toggleLeft: () => void): void {
    this.#toggleLeft = toggleLeft
  }

  /**
   * No-op: the studio frame renders the Conversation panel exclusively, so
   * there is no panel selection to change.
   * @param _panelId - ignored.
   */
  selectPanel(_panelId: MainPanelId | null): void {}

  /** @returns the new pending navigation's cancellation signal, aborting the previous one. */
  beginNavigation(): AbortSignal {
    this.#navigation.abort()
    this.#navigation = new AbortController()
    return this.#navigation.signal
  }

  /** Invalidate pending navigations when the layout owner is unloaded. */
  dispose(): void {
    this.#navigation.abort()
  }

  /** Toggle the left rail (the studio's sidebar equivalent). */
  toggleSidebar(): void {
    this.#require().toggleLeft()
  }

  /**
   * No-op: this layout has no rightbar column.
   * @param _track - ignored.
   * @param _fullscreen - ignored.
   */
  openRightbar(_track: boolean, _fullscreen: boolean): void {}

  /** No-op: this layout has no rightbar column. */
  closeRightbar(): void {}

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
