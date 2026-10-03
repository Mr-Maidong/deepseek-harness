import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const getAllDisplays = vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }])

vi.mock('electron', () => ({ screen: { getAllDisplays: () => getAllDisplays() } }))

const { loadWindowBounds, restoredWindowBounds, trackWindowBounds, wasMaximized } =
  await import('../src/window-bounds.ts')

/** A userData directory removed when the test finishes. @returns the directory path. */
function userData(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-window-bounds-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  return root
}

/** One window stub exposing the geometry surface the recorder reads. */
class FakeWindow extends EventEmitter {
  destroyed = false
  maximized = false
  bounds = { x: 0, y: 0, width: 1280, height: 820 }
  isDestroyed() { return this.destroyed }
  getBounds() { return this.bounds }
  isMaximized() { return this.maximized }
  /** Resize and move the window the way a user drag would. */
  resize(bounds: Partial<FakeWindow['bounds']>): void {
    this.bounds = { ...this.bounds, ...bounds }
    this.emit('resize')
  }
}

/** The saved record as written to userData. @param root - userData directory. @returns the parsed JSON. */
function saved(root: string): unknown {
  return JSON.parse(readFileSync(join(root, 'window-bounds.json'), 'utf8'))
}

/** Whether a record exists in userData yet. @param root - userData directory. @returns true when written. */
function exists(root: string): boolean {
  return existsSync(join(root, 'window-bounds.json'))
}

/**
 * Wait for the recorder's settle timer and the atomic write that follows it.
 *
 * The recorder coalesces on a real 250ms timer and writes through the real file
 * system, so this waits on wall-clock rather than on fake timers — a fake clock
 * cannot advance the file system's own work.
 * @param root - userData directory, watched for the record's arrival.
 * @returns once the record is readable, or after the timeout.
 */
async function waitForRecord(root: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (!exists(root) && Date.now() < deadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20) })
  }
  await new Promise((resolve) => { setTimeout(resolve, 50) })
}

/**
 * Wait for the recorder to publish a record matching a condition.
 * @param predicate - reads the current record and reports whether it is the expected one.
 * @returns once the predicate holds.
 */
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => { setTimeout(resolve, 20) })
  }
}

beforeEach(() => {
  getAllDisplays.mockReturnValue([{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }])
})

describe('restoring window geometry', () => {
  it('opens at the default size when nothing was saved', () => {
    loadWindowBounds(userData())
    expect(restoredWindowBounds()).toBeNull()
    expect(wasMaximized()).toBe(false)
  })

  it('restores a saved size and position', () => {
    const root = userData()
    writeFileSync(join(root, 'window-bounds.json'),
      JSON.stringify({ x: 40, y: 60, width: 1600, height: 900, maximized: false }))
    loadWindowBounds(root)
    expect(restoredWindowBounds()).toEqual({ x: 40, y: 60, width: 1600, height: 900 })
  })

  it('opens maximized at the default size rather than the screen size', () => {
    const root = userData()
    writeFileSync(join(root, 'window-bounds.json'),
      JSON.stringify({ x: 0, y: 0, width: 1920, height: 1080, maximized: true }))
    loadWindowBounds(root)
    // The stored size belongs to the screen; the window is maximized after it opens.
    expect(restoredWindowBounds()).toBeNull()
    expect(wasMaximized()).toBe(true)
  })

  it('drops a position that no longer lands on a display', () => {
    const root = userData()
    // The second monitor this position belonged to is gone.
    getAllDisplays.mockReturnValue([{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }])
    writeFileSync(join(root, 'window-bounds.json'),
      JSON.stringify({ x: 3200, y: 400, width: 1400, height: 900, maximized: false }))
    loadWindowBounds(root)
    expect(restoredWindowBounds()).toBeNull()
  })

  it('keeps a position on a secondary display', () => {
    const root = userData()
    getAllDisplays.mockReturnValue([
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
      { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } },
    ])
    writeFileSync(join(root, 'window-bounds.json'),
      JSON.stringify({ x: 2200, y: 300, width: 1400, height: 900, maximized: false }))
    loadWindowBounds(root)
    expect(restoredWindowBounds()).toEqual({ x: 2200, y: 300, width: 1400, height: 900 })
  })

  it.each([
    ['a missing file', undefined],
    ['malformed JSON', '{"x":'],
    ['a non-numeric width', '{"x":0,"y":0,"width":"wide","height":900}'],
    ['a zero width', '{"x":0,"y":0,"width":0,"height":900}'],
    ['a JSON array', '[0,0,1280,820]'],
  ])('falls back to the default size for %s', (_label, contents) => {
    const root = userData()
    if (contents !== undefined) writeFileSync(join(root, 'window-bounds.json'), contents)
    loadWindowBounds(root)
    expect(restoredWindowBounds()).toBeNull()
    expect(wasMaximized()).toBe(false)
  })
})

describe('recording window geometry', () => {
  it('coalesces a drag into one write of the settled size', async () => {
    const root = userData()
    const window = new FakeWindow()
    trackWindowBounds(window as unknown as BrowserWindow, root)
    for (let width = 1300; width <= 1400; width += 10) window.resize({ width })
    // The drag is still in flight; nothing is written while it continues.
    expect(exists(root)).toBe(false)
    await waitForRecord(root)
    expect(saved(root)).toEqual({ x: 0, y: 0, width: 1400, height: 820, maximized: false })
  })

  it('records the maximized state and the size to restore to', async () => {
    const root = userData()
    const window = new FakeWindow()
    trackWindowBounds(window as unknown as BrowserWindow, root)
    window.resize({ width: 1500, height: 950 })
    await waitForRecord(root)
    window.maximized = true
    window.bounds = { x: 0, y: 0, width: 1920, height: 1080 }
    window.emit('maximize')
    await waitFor(() => {
      const record = saved(root) as { maximized: boolean }
      return record.maximized
    })
    // The unmaximize restores the size the window had before, not the screen's.
    window.maximized = false
    window.bounds = { x: 0, y: 0, width: 1500, height: 950 }
    window.emit('unmaximize')
    await waitFor(() => {
      const record = saved(root) as { width: number; maximized: boolean }
      return !record.maximized && record.width === 1500
    })
    expect(saved(root)).toEqual({ x: 0, y: 0, width: 1500, height: 950, maximized: false })
  })

  it('flushes a pending write when the window closes', async () => {
    const root = userData()
    const window = new FakeWindow()
    trackWindowBounds(window as unknown as BrowserWindow, root)
    window.resize({ width: 1500 })
    // The close arrives before the settle timer; the geometry is still saved.
    window.emit('close')
    await waitForRecord(root)
    expect(saved(root)).toEqual({ x: 0, y: 0, width: 1500, height: 820, maximized: false })
  })

  it('records the geometry on the first close even without a move', async () => {
    const root = userData()
    const window = new FakeWindow()
    trackWindowBounds(window as unknown as BrowserWindow, root)
    // Nothing has changed since attach; close still publishes where the window is.
    window.emit('close')
    await waitForRecord(root)
    expect(saved(root)).toEqual({ x: 0, y: 0, width: 1280, height: 820, maximized: false })
  })

  it('stops recording after disposal', async () => {
    const root = userData()
    const window = new FakeWindow()
    const dispose = trackWindowBounds(window as unknown as BrowserWindow, root)
    window.resize({ width: 1500 })
    dispose()
    await waitForRecord(root)
    window.resize({ width: 1700 })
    await new Promise((resolve) => { setTimeout(resolve, 400) })
    // The post-dispose resize is not published; the flush at dispose stands.
    expect(saved(root)).toEqual({ x: 0, y: 0, width: 1500, height: 820, maximized: false })
  })
})
