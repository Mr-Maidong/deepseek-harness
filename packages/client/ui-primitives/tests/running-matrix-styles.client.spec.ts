/**
 * RunningMatrix's geometry and motion as CSS text. jsdom has no layout and CSS
 * Modules resolve to class-name maps in the component suites, so the grid, the
 * ring order and its delays, and the fallbacks can only be read from the
 * stylesheet: a missing delay or a dropped fallback regresses silently.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/RunningMatrix.module.css', import.meta.url)), 'utf8')

describe('RunningMatrix.module.css', () => {
  it('lays six square cells out as a three-row, two-column grid', () => {
    expect(css).toMatch(/\.runningMatrix\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*var\(--dsh-running-cell\)\)/s)
    expect(css).toMatch(/\.runningMatrix\s*\{[^}]*grid-template-rows:\s*repeat\(3,\s*var\(--dsh-running-cell\)\)/s)
    // Square tracks: each axis budget divides the seat by its cell count, and
    // the smaller one wins so neither axis overflows the square seat.
    const cellBudget = [
      String.raw`--dsh-running-cell:\s*min\(`,
      String.raw`\s*calc\(\(var\(--dsh-running-matrix-size\) - var\(--dsh-running-matrix-gap\)\) \/ 2\),`,
      String.raw`\s*calc\(\(var\(--dsh-running-matrix-size\) - 2 \* var\(--dsh-running-matrix-gap\)\) \/ 3\)\s*\)`,
    ].join('')
    expect(css).toMatch(new RegExp(cellBudget, 's'))
  })

  it('sizes the seat from a host-rebindable property', () => {
    // Hosts whose seat is a different size rebind this instead of restating
    // the grid; the default keeps a standalone render at the 12px seat.
    expect(css).toMatch(/--dsh-running-matrix-size:\s*12px;/)
    expect(css).toMatch(/\.runningMatrix\s*\{[^}]*width:\s*var\(--dsh-running-matrix-size\)/s)
    expect(css).toMatch(/\.runningMatrix\s*\{[^}]*height:\s*var\(--dsh-running-matrix-size\)/s)
  })

  it('sweeps the perimeter clockwise from the top-left, one step per cell', () => {
    // DOM order is 1 2 / 3 4 / 5 6; the ring visits the six perimeter cells as
    // 1 -> 2 -> 4 -> 6 -> 5 -> 3, one .15s step inside a .9s cycle.
    const delays = Object.fromEntries(
      [...css.matchAll(/\.runningMatrix > span:nth-child\((\d)\) \{ animation-delay: ([\d.]+)s; \}/g)]
        .map(([, cell, delay]) => [cell!, Number(delay)]),
    )
    expect(delays).toEqual({ 1: 0, 2: 0.15, 4: 0.3, 6: 0.45, 5: 0.6, 3: 0.75 })
    expect(css).toContain('animation: dsh-running-matrix-ring .9s ease-in-out infinite')
  })

  it('keeps every cell visible at the trough and composites only opacity and transform', () => {
    // A running mark must never read as stopped, so no cell falls to
    // transparent; the trough holds a floor above zero.
    expect(css).toMatch(/--dsh-running-cell-floor:\s*\.3;/)
    expect(css).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*var\(--dsh-running-cell-floor\);[^}]*transform:\s*scale\(\.8\);/s)
    expect(css).toMatch(/35%\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\);/s)
    expect(css).toContain('will-change: opacity, transform')
    expect(css).toContain('contain: strict')
    expect(css).toContain('color: inherit')
  })

  it('animates only without reduced motion or forced colors, and stays solid otherwise', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\)/)
    // Outside that media block every cell paints solid currentColor, so the
    // static mark still reads as activity.
    expect(css).toMatch(/\.runningMatrix > span\s*\{[^}]*display:\s*block;[^}]*background:\s*currentColor;/s)
  })
})
