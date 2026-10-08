import css from './RunningMatrix.module.css'

/** Cells in DOM order; the stylesheet assigns the ring order and per-cell delays. */
const CELLS = [0, 1, 2, 3, 4, 5]

/**
 * Render the running-activity mark: a three-row, two-column grid of square
 * cells lit clockwise around its perimeter. Decorative and `aria-hidden`, so
 * the render site owns the accessible name, and the cells inherit the seat's
 * color. The stylesheet owns cell geometry, timing, and the reduced-motion and
 * forced-colors fallbacks, where all six cells stay solid. A host whose seat is
 * a different size rebinds `--dsh-running-matrix-size` on any ancestor.
 * @returns the seat holding the six cells.
 */
export function RunningMatrix() {
  return (
    <span className={css.runningMatrix} data-running-matrix aria-hidden="true">
      {CELLS.map(cell => <span key={cell} />)}
    </span>
  )
}
