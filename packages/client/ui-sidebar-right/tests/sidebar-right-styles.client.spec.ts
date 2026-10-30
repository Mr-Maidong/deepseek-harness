/**
 * The panel's styling as CSS text, where it reaches into the docking kit and
 * how its docked margins slide.
 *
 * The kit paints its own chrome around a docked pane, including the first
 * pane's left hairline. Only one presentation has to lose it, and this sheet
 * owns that override: the kit's class names are hashed at build time, so the
 * pane can only be named by the data attributes the kit's own rule reads, and
 * only the selector text shows that the override still covers that rule.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Read one stylesheet by path. @param relative - path from this spec's directory. @returns the file text. */
function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

/** The kit's rule for the first docked pane, as its own sheet writes it. */
const KIT_HAIRLINE = ".tabCell[data-dockkit-host='dock'][data-dockkit-column='0'] > .tabHost"

/** The fullscreen panel's override of that rule. */
const PANEL_RESET = ".panel[data-sidebar-right-panel='fullscreen']"
  + " :global([data-dockkit-host='dock'][data-dockkit-column='0'])"
  + " > :global([data-dockkit-column='0'][data-dockkit-pane])"

const panelCss = read('../src/client/shell/SidebarRight.module.css')
const kitCss = read('../../ui-dockkit/src/components/dockkit.module.css')
const css = panelCss.replace(/\/\*[\s\S]*?\*\//g, ' ')
const host = String.raw`:global\(\[data-dockkit-host='dock'\]\)`

/**
 * Declarations of one exact selector, keyed by property.
 * @param stylesheet - stylesheet text.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when the selector is absent.
 */
function declarations(stylesheet: string, selector: string): Map<string, string> | undefined {
  const withoutComments = stylesheet.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

/** The attribute selectors one selector lists, sorted. @param selector - selector text. @returns the `[name=value]` texts. */
function attributes(selector: string): string[] {
  return [...selector.matchAll(/\[[\w-]+=[^\]]+\]/g)].map(match => match[0]).sort()
}

describe('SidebarRight.module.css', () => {
  it('clears the first docked pane’s hairline while the panel is fullscreen', () => {
    expect(declarations(panelCss, PANEL_RESET)?.get('border-left')).toBe('none')
  })

  it('names the pane by the attributes the kit’s own rule reads', () => {
    // The kit's sheet draws the line through its hashed class names; this sheet
    // cannot read them, so it repeats the cell's two attributes instead.
    expect(declarations(kitCss, KIT_HAIRLINE)?.get('border-left'))
      .toBe('0.5px solid var(--dsw-alias-border-l4)')
    expect(attributes(PANEL_RESET)).toEqual(expect.arrayContaining(attributes(KIT_HAIRLINE)))
    expect(PANEL_RESET).toContain(' > :global(')
  })

  it('removes the line in no other presentation', () => {
    // Push keeps it: that edge divides the panel from the conversation.
    const resets = [...panelCss.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body = '']) => /border-left:\s*none/.test(body))
      .map(([, selectorList = '']) => selectorList.trim())
    expect(resets).toEqual([PANEL_RESET])
  })

  it('starts docked items mounted by an opening at the closed position', () => {
    expect(css).toMatch(new RegExp(String.raw`@starting-style\s*\{\s*\.panel\[data-sidebar-right-opening\] ${host},[^{}]*\{`
      + String.raw`\s*transform: translateX\(var\(--dsh-sidebar-width\)\);\s*}\s*}`))
  })

  it('removes the open slide as well as the close slide for reduced motion', () => {
    expect(css).toMatch(new RegExp(String.raw`@media \(prefers-reduced-motion: reduce\)\s*\{[^{}]*`
      + String.raw`\.panel\[data-sidebar-right-open\] ${host}[^{}]*\{\s*transition: none;\s*}`))
  })
})
