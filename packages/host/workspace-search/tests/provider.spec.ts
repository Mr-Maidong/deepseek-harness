/**
 * LocalWorkspaceSearch behavior over real temporary directories: the provider
 * spawns the packaged ripgrep binary (`@vscode/ripgrep`) through the real
 * local subprocess runtime, so every assertion observes the bounded results a
 * composed Host reports. The binary ships as an npm dependency, so the tests
 * always run.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalWorkspaceSearch from '../src/index.ts'
import type { WorkspaceSearchResult } from '../src/types.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

/** Create a directory with a few files, a .gitignore, and a node_modules dir. */
function sampleDir(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-search-')))
  roots.push(root)
  writeFileSync(join(root, 'a.ts'), 'const greeting = "hello"\nconsole.log(greeting)\n')
  writeFileSync(join(root, 'b.ts'), 'export const hello = 1\n')
  writeFileSync(join(root, 'ignored.txt'), 'hello ignored\n')
  writeFileSync(join(root, '.gitignore'), 'ignored.txt\n')
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'node_modules', 'dep.js'), 'hello from dep\n')
  return root
}

async function searchOf(path: string, query: string): Promise<WorkspaceSearchResult> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalWorkspaceSearch)
  const service = ctx.get('workspaceSearch')
  if (service === undefined) throw new Error('workspaceSearch did not register')
  return service.search(path, query)
}

describe('LocalWorkspaceSearch', () => {
  it('finds matches across files and honors .gitignore', async () => {
    const root = sampleDir()
    const result = await searchOf(root, 'hello')
    expect(result.fileCount).toBe(2)
    expect(result.matchCount).toBe(2)
    const paths = result.files.map(f => f.path).sort()
    expect(paths).toEqual([join(root, 'a.ts'), join(root, 'b.ts')])
    // The ignored file and node_modules are excluded.
    expect(paths).not.toContain(join(root, 'ignored.txt'))
    expect(paths).not.toContain(join(root, 'node_modules', 'dep.js'))
    expect(result.truncated).toBe(false)
  })

  it('reports line and column positions', async () => {
    const root = sampleDir()
    const result = await searchOf(root, 'hello')
    const a = result.files.find(f => f.path === join(root, 'a.ts'))
    expect(a).toBeDefined()
    const match = a?.matches[0]
    // "hello" begins at 1-based column 19 in `const greeting = "hello"`.
    expect(match).toMatchObject({ line: 1, column: 19 })
    expect(match?.preview).toContain('hello')
  })

  it('returns an empty result when nothing matches', async () => {
    const root = sampleDir()
    const result = await searchOf(root, 'zzzz-no-such-text')
    expect(result.files).toEqual([])
    expect(result.fileCount).toBe(0)
    expect(result.matchCount).toBe(0)
    expect(result.truncated).toBe(false)
  })

  it('treats the query as plain text, not a regex', async () => {
    const root = sampleDir()
    writeFileSync(join(root, 'regex.txt'), 'a.b\n')
    // A regex `.` would match "aXb"; fixed-strings must not.
    const result = await searchOf(root, 'a.b')
    const regex = result.files.find(f => f.path === join(root, 'regex.txt'))
    expect(regex).toBeDefined()
    expect(regex?.matches[0]?.preview).toContain('a.b')
  })

  it('rejects an over-long query', async () => {
    const root = sampleDir()
    await expect(searchOf(root, 'x'.repeat(2048))).rejects.toThrow(/exceeds/)
  })

  it('propagates a cancelled search', async () => {
    const root = sampleDir()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalWorkspaceSearch)
    const controller = new AbortController()
    controller.abort()
    await expect(ctx.get('workspaceSearch')!.search(root, 'hello', controller.signal))
      .rejects.toThrow(/aborted/)
  })
})
