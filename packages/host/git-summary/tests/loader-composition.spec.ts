/**
 * REAL-composition coverage: a test-only cordis.yml booted through the vendored
 * Loader composes the subprocess provider and the git-summary provider, and the
 * assertions observe what the shipped GUI reads — the branch and change counts
 * of a real repository — plus removal of `ctx.gitSummary` when its fiber is
 * disposed (HMR safety).
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as GitSummary from '../src/index.ts'
import type { GitSummaryRuntime } from '../src/service.ts'

const run = promisify(execFile)
const SUBPROCESS = '@deepseek-ai/dsh-subprocess-local'
const GIT_SUMMARY = '@deepseek-ai/dsh-host-git-summary'

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  root = undefined
})

/** Boot the two shipped rows through the real Loader against a temporary config. */
async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-git-summary-loader-'))
  const configPath = join(root, 'cordis.yml')
  writeFileSync(configPath, [
    `- name: '${SUBPROCESS}'`,
    `- name: '${GIT_SUMMARY}'`,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    [SUBPROCESS, LocalSubprocessRuntime],
    [GIT_SUMMARY, GitSummary],
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

/** Create a small repository with one committed file and one uncommitted edit. */
async function sampleRepo(): Promise<string> {
  const repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-summary-boot-')))
  const identity = ['-c', 'user.email=spec@dsh.test', '-c', 'user.name=DSH Spec']
  await run('git', [...identity, 'init', '--initial-branch=main', repo])
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
  await run('git', [...identity, '-C', repo, 'add', 'a.txt'])
  await run('git', [...identity, '-C', repo, 'commit', '-m', 'seed'])
  writeFileSync(join(repo, 'a.txt'), 'one\nchanged\nadded\n')
  return repo
}

describe('real Loader composition', () => {
  it('serves branch and change counts for a composed Host and unmounts on disposal', { timeout: 60_000 }, async () => {
    const ctx = await loadComposition()
    const repo = await sampleRepo()

    const summary = ctx.get('gitSummary') as GitSummaryRuntime
    await expect(summary.summary(repo)).resolves.toEqual({
      branch: 'main',
      detached: false,
      insertions: 2,
      deletions: 1,
      untrackedFiles: 0,
    })

    // HMR safety: disposing the provider's fiber removes the service, so a
    // reload cannot leave a stale ctx.gitSummary behind.
    const entry = [...ctx.loader.entries()].find(item => item.options.name === GIT_SUMMARY)
    if (entry?.fiber === undefined) throw new Error('git-summary row did not mount')
    await entry.fiber.dispose()
    expect(ctx.get('gitSummary')).toBeUndefined()
  })
})
