/**
 * LocalGitSummary behavior over real temporary git repositories: the provider
 * spawns the host `git` CLI through the real local subprocess runtime, so every
 * assertion observes the branch and change counts a composed Host reports.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalGitSummary from '../src/index.ts'
import type { GitSummaryResult } from '../src/types.ts'

const run = promisify(execFile)

/** Commit identity supplied per call so no test depends on the operator's global config. */
const IDENTITY = ['-c', 'user.email=spec@dsh.test', '-c', 'user.name=DSH Spec']

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

/** Create a repository with one committed file whose lines are all additions. */
async function stagedRepo(): Promise<string> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-summary-')))
  roots.push(root)
  await run('git', [...IDENTITY, 'init', '--initial-branch=main', root])
  writeFileSync(join(root, 'a.txt'), 'one\ntwo\nthree\n')
  await run('git', [...IDENTITY, '-C', root, 'add', 'a.txt'])
  await run('git', [...IDENTITY, '-C', root, 'commit', '-m', 'seed'])
  return root
}

async function summaryOf(path: string): Promise<GitSummaryResult | null> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalGitSummary)
  const service = ctx.get('gitSummary')
  if (service === undefined) throw new Error('gitSummary did not register')
  return service.summary(path)
}

describe('LocalGitSummary', () => {
  it('reports null for a directory no repository contains', async () => {
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-outside-')))
    roots.push(outside)
    await expect(summaryOf(outside)).resolves.toBeNull()
  })

  it('reports the branch and unstaged totals against HEAD', async () => {
    const root = await stagedRepo()
    writeFileSync(join(root, 'a.txt'), 'one\nchanged\nthree\nextra\n')
    await expect(summaryOf(root)).resolves.toMatchObject({
      branch: 'main',
      detached: false,
      insertions: 2,
      deletions: 1,
      untrackedFiles: 0,
    })
  })

  it('counts staged and unstaged changes together', async () => {
    const root = await stagedRepo()
    writeFileSync(join(root, 'a.txt'), 'one\ntwo\nstaged\n')
    await run('git', [...IDENTITY, '-C', root, 'add', 'a.txt'])
    writeFileSync(join(root, 'a.txt'), 'one\ntwo\nstaged\nunstaged\n')
    const summary = await summaryOf(root)
    expect(summary).toMatchObject({ insertions: 2, deletions: 1, untrackedFiles: 0 })
  })

  it('reports no branch when HEAD is detached', async () => {
    const root = await stagedRepo()
    await run('git', [...IDENTITY, '-C', root, 'checkout', '--detach'])
    await expect(summaryOf(root)).resolves.toMatchObject({ branch: null, detached: true })
  })

  it('diffs an unborn branch against the empty tree', async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-git-unborn-')))
    roots.push(root)
    await run('git', [...IDENTITY, 'init', '--initial-branch=main', root])
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'c.txt'), 'a\nb\n')
    await run('git', [...IDENTITY, '-C', root, 'add', 'sub/c.txt'])
    await expect(summaryOf(root)).resolves.toMatchObject({
      branch: 'main',
      insertions: 2,
      deletions: 0,
      untrackedFiles: 0,
    })
  })

  it('reports zero changes for a clean working tree', async () => {
    const root = await stagedRepo()
    await expect(summaryOf(root)).resolves.toMatchObject({
      branch: 'main',
      insertions: 0,
      deletions: 0,
      untrackedFiles: 0,
    })
  })

  it('resolves the repository from a nested directory', async () => {
    const root = await stagedRepo()
    const nested = join(root, 'deep', 'deeper')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'x.txt'), 'x\n')
    const summary = await summaryOf(nested)
    expect(summary).toMatchObject({ branch: 'main', untrackedFiles: 1 })
  })

  it('degrades counts to zero when the index cannot be read', async () => {
    const root = await stagedRepo()
    writeFileSync(join(root, 'a.txt'), 'one\ntwo\nchanged\n')
    // A damaged index makes `git diff` and `git ls-files` fail while the refs
    // still resolve: the read reports the branch with zeroed counts instead of
    // failing, because the counts are absent facts rather than an error.
    writeFileSync(join(root, '.git', 'index'), 'not a git index')
    await expect(summaryOf(root)).resolves.toMatchObject({
      branch: 'main',
      insertions: 0,
      deletions: 0,
      untrackedFiles: 0,
    })
  })

  it('propagates a cancelled read instead of reporting a summary', async () => {
    const root = await stagedRepo()
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalGitSummary)
    const controller = new AbortController()
    controller.abort()
    // An aborted caller receives no GitSummaryResult: cancellation is not the
    // same fact as "this directory is not a repository".
    await expect(ctx.get('gitSummary')!.summary(root, controller.signal)).rejects.toThrow(/aborted/)
  })
})
