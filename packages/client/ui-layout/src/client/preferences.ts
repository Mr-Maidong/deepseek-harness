/**
 * Persisted panel widths, in localStorage. The frame restores the dragged
 * sidebar and right-panel preferences across restarts; everything else in the
 * layout store (measurements, panel selection, presentation reports) is
 * transient and stays in memory.
 *
 * Narrow read and write instead of a whole-store snapshot: the store's
 * `persist` key would also capture `viewportWidth`, the active main panel, and
 * the right panel's reported presentation, none of which describe a user
 * preference worth restoring. The right panel's *width* is restored, its open
 * state is not — that belongs to its occupant, which already persists its own
 * layout tree separately.
 */
import {
  clampWidth, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/** localStorage key for the dragged panel widths (px). */
const WIDTHS_KEY = 'dsh.layout.widths.v1'

/** The two persisted widths; absent rightbar means "never opened". */
interface PanelWidths {
  /** Left sidebar width in px, 0 when closed. */
  sidebar: number
  /** Right panel width in px, or null before its first opening. */
  rightbar: number | null
}

/**
 * Narrow a stored value to a finite px width inside the panel's drag range.
 * @param value - candidate read from storage.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the rounded width, or null when the value is not a usable number.
 */
function usableWidth(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return clampWidth(value, min, max)
}

/**
 * Read the persisted widths, clamped to the ranges the current design allows.
 *
 * The stored values are preferences, not guarantees: a width saved on a wide
 * monitor must still fit a smaller frame, so both are re-clamped here. The
 * right panel's ceiling is a fraction of the frame and therefore needs the live
 * measurement, which the frame supplies. Each field is admitted on its own, so
 * one corrupt value costs only that panel's preference.
 * @param viewportWidth - current frame width in px.
 * @returns the stored widths, or null when the record itself is unreadable.
 */
export function readPanelWidths(viewportWidth: number): PanelWidths | null {
  if (typeof localStorage === 'undefined') return null
  let saved: unknown
  try {
    const raw = localStorage.getItem(WIDTHS_KEY)
    if (raw === null) return null
    saved = JSON.parse(raw) as unknown
  } catch (_unreadableRecord) {
    return null
  }
  if (typeof saved !== 'object' || saved === null) return null
  const { sidebar, rightbar } = saved as Partial<PanelWidths>
  // 0 is the closed sidebar, a state rather than a width; clamping it up to the
  // floor would silently reopen a sidebar the user closed.
  const restoredSidebar = sidebar === 0 ? 0 : usableWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  // null is the right panel before its first opening, which is also what an
  // unreadable value falls back to: the frame re-derives it from the frame.
  const restoredRightbar = rightbar === null || rightbar === undefined
    ? null
    : usableWidth(rightbar, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, viewportWidth * RIGHTBAR_MAX_RATIO))
  return { sidebar: restoredSidebar ?? SIDEBAR_DEFAULT, rightbar: restoredRightbar }
}

/**
 * Write the current width preferences. Only the drag results are stored; the
 * frame's clamp already limits them, so no further validation applies.
 * @param widths - the two preferences to save.
 */
export function writePanelWidths(widths: PanelWidths): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths))
  } catch (error) {
    console.error('Layout width persistence failed:', error)
  }
}

/** The persisted-width record, for the store's init and tests. */
export type { PanelWidths }
