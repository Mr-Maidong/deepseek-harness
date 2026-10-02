/** The application font faces stay self-contained in the packaged Web application. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const WOFF2_MAGIC = 0x774f4632

describe('bundled application fonts', () => {
  it('ships a local WOFF2 for each face with its license', () => {
    const css = readFileSync(new URL('../src/styles/app-font.css', import.meta.url), 'utf8')
    expect(css).toContain("font-family: 'Albert Sans'")
    expect(css).toContain('font-weight: 100 900')
    expect(css).toContain("font-family: 'YaHei Consolas Hybrid'")
    expect(css).toContain("local('YaHei Consolas Hybrid')")
    expect(css).not.toMatch(/url\(https?:/)

    for (const name of ['albert-sans.woff2', 'yahei-consolas-hybrid.woff2']) {
      expect(css).toContain(`url(./${name})`)
      const font = readFileSync(new URL(`../src/styles/${name}`, import.meta.url))
      expect(font.readUInt32BE(0)).toBe(WOFF2_MAGIC)
    }

    const license = readFileSync(new URL('../src/styles/AlbertSans-OFL.txt', import.meta.url), 'utf8')
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1')

    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      files: string[]
      exports: Record<string, unknown>
    }
    expect(manifest.files).toContain('lib/styles')
    expect(manifest.exports['./app-font.css']).toBe('./lib/styles/app-font.css')
  })
})
