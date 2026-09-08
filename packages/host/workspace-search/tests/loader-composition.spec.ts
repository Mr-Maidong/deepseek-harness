/**
 * REAL-composition coverage: a test-only cordis.yml booted through the vendored
 * Loader composes the subprocess provider and the workspace-search provider,
 * and the assertions observe what the shipped GUI reads — the bounded search
 * results of a real directory — plus removal of `ctx.workspaceSearch` when its
 * fiber is disposed (HMR safety). The packaged ripgrep binary ships as an npm
 * dependency, so the composition always runs.
 */
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as WorkspaceSearch from '../src/index.ts'
import type { WorkspaceSearchRuntime } from '../src/service.ts'

const SUBPROCESS = '@deepseek-ai/dsh-subprocess-local'
const WORKSPACE_SEARCH = '@deepseek-ai/dsh-host-workspace-search'

let context: Context | undefined
let root: string | undefined
const sampleDirs: string[] = []

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  root = undefined
  for (const dir of sampleDirs.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

/** Boot the two shipped rows through the real Loader against a temporary config. */
async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-workspace-search-loader-'))
  const configPath = join(root, 'cordis.yml')
  writeFileSync(configPath, [
    `- name: '${SUBPROCESS}'`,
    `- name: '${WORKSPACE_SEARCH}'`,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    [SUBPROCESS, LocalSubprocessRuntime],
    [WORKSPACE_SEARCH, WorkspaceSearch],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return ctx
}

/** Create a small directory with a couple of files and a .gitignore. */
function sampleDir(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-workspace-search-boot-')))
  sampleDirs.push(dir)
  writeFileSync(join(dir, 'a.ts'), 'const greeting = "hello"\n')
  writeFileSync(join(dir, 'ignored.txt'), 'hello ignored\n')
  writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n')
  return dir
}

describe('real Loader composition', () => {
  it('serves bounded search results for a composed Host and unmounts on disposal', { timeout: 60_000 }, async () => {
    const ctx = await loadComposition()
    const dir = sampleDir()

    const search = ctx.get('workspaceSearch') as WorkspaceSearchRuntime
    const result = await search.search(dir, 'hello')
    expect(result.fileCount).toBe(1)
    expect(result.files[0]?.path).toBe('a.ts')
    expect(result.files[0]?.matches[0]).toMatchObject({ line: 1, column: 19 })
    expect(result.truncated).toBe(false)

    // HMR safety: disposing the provider's fiber removes the service, so a
    // reload cannot leave a stale ctx.workspaceSearch behind.
    const entry = [...ctx.loader.entries()].find(item => item.options.name === WORKSPACE_SEARCH)
    if (entry?.fiber === undefined) throw new Error('workspace-search row did not mount')
    await entry.fiber.dispose()
    expect(ctx.get('workspaceSearch')).toBeUndefined()
  })
})
