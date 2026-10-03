/**
 * Main-window geometry in Electron userData, so a resize, a move, and the
 * maximized state survive a restart.
 *
 * The record is written from the window's own move/resize events and read once
 * at startup. Reading is synchronous and cached so the main window can be
 * created inside the synchronous startup path; a window that opened at the
 * default size and then resized would visibly jump on every launch.
 *
 * Bounds are stored in the DIP coordinates `getBounds` reports, which is also
 * what `setBounds` takes, so no per-display scale conversion is involved.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

/** Saved main-window geometry, as the window reports and accepts it. */
export interface DesktopWindowBounds {
  /** Left edge in DIP px. */
  x: number
  /** Top edge in DIP px. */
  y: number
  /** Frame width in DIP px. */
  width: number
  /** Frame height in DIP px. */
  height: number
  /** Whether the window was maximized; the size is then the screen's. */
  maximized: boolean
}

/** Bounds read at startup, or null for the default size. Null until loaded. */
let restored: DesktopWindowBounds | null | undefined

/**
 * Read and validate the saved geometry from userData.
 * @param saved - parsed file contents.
 * @returns the validated bounds, or null when the record is unusable.
 */
function validate(saved: unknown): DesktopWindowBounds | null {
  if (typeof saved !== 'object' || saved === null) return null
  const { x, y, width, height, maximized } = saved as Partial<DesktopWindowBounds>
  const numbers = [x, y, width, height]
  if (numbers.some(value => typeof value !== 'number' || !Number.isFinite(value))) return null
  if ((width as number) <= 0 || (height as number) <= 0) return null
  return { x: x as number, y: y as number, width: width as number, height: height as number, maximized: maximized === true }
}

/**
 * Load the saved geometry once, before the main window is created.
 *
 * A missing file is the first launch and a corrupt one is treated the same
 * way: neither prevents a window from opening, at the default size.
 * @param userData - Electron-owned userData directory.
 */
export function loadWindowBounds(userData: string): void {
  try {
    restored = validate(JSON.parse(readFileSync(join(userData, 'window-bounds.json'), 'utf8')) as unknown)
  } catch (_noSavedGeometry) {
    restored = null
  }
}

/**
 * Whether a saved rectangle still lands on a display the window can be shown
 * on. Position needs this check because a monitor may have been unplugged
 * since the last run, which would otherwise open the window off-screen. Size
 * is left to the window's own minimums.
 * @param bounds - the saved rectangle.
 * @returns true when a usable part of the rectangle is on some display.
 */
function isOnADisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    // Require a real overlap rather than a single pixel, so the title bar and
    // a usable amount of content stay reachable for grabbing and dragging.
    return bounds.x < area.x + area.width - 80 && bounds.x + bounds.width > area.x + 80
      && bounds.y < area.y + area.height - 40 && bounds.y + bounds.height > area.y + 40
  })
}

/**
 * The bounds the main window should open at. A maximized session opens at the
 * default size and is maximized afterwards, because a maximized window's stored
 * size is the screen's rather than a user-chosen restore size. An off-screen
 * position is dropped rather than corrected, leaving placement to the platform.
 * @returns saved bounds, or null to open at the default size.
 */
export function restoredWindowBounds(): Rectangle | null {
  if (restored === undefined || restored === null || restored.maximized) return null
  return isOnADisplay(restored) ? { x: restored.x, y: restored.y, width: restored.width, height: restored.height } : null
}

/**
 * Whether the window was maximized when it was last closed.
 * @returns true when the next window should open maximized.
 */
export function wasMaximized(): boolean {
  return restored?.maximized === true
}

/**
 * Persist the main window's geometry from its move and resize events.
 *
 * Writes coalesce onto one trailing timeout: a drag emits a `move`/`resize` per
 * frame, and each of those would otherwise be an atomic file replacement. The
 * value comparison drops the repeats a settled window still emits.
 * @param window - the window whose geometry is saved.
 * @param userData - Electron-owned userData directory.
 * @returns a disposer that flushes any pending write.
 */
export function trackWindowBounds(window: BrowserWindow, userData: string): () => void {
  let pending: NodeJS.Timeout | null = null
  let last: DesktopWindowBounds | null = null
  const flush = (): void => {
    pending = null
    if (window.isDestroyed()) return
    const { x, y, width, height } = window.getBounds()
    const next: DesktopWindowBounds = { x, y, width, height, maximized: window.isMaximized() }
    if (last !== null && last.x === next.x && last.y === next.y && last.width === next.width
      && last.height === next.height && last.maximized === next.maximized) return
    last = next
    try {
      writeFileAtomic(join(userData, 'window-bounds.json'), JSON.stringify(next), { mode: 0o600, dirMode: 0o700 })
        .catch((error: unknown) => { console.warn('desktop window: could not record window bounds', error) })
    } catch (error) { console.warn('desktop window: could not record window bounds', error) }
  }
  const schedule = (): void => {
    if (pending !== null) clearTimeout(pending)
    pending = setTimeout(flush, 250)
  }
  window.on('move', schedule)
  window.on('resize', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  // Closing is the last chance to record geometry: after this the window is
  // gone, and a resize made during shutdown may not have reached the timer.
  window.on('close', flush)
  return () => {
    if (pending !== null) { clearTimeout(pending); flush() }
    window.removeListener('move', schedule)
    window.removeListener('resize', schedule)
    window.removeListener('maximize', schedule)
    window.removeListener('unmaximize', schedule)
    window.removeListener('close', flush)
  }
}
