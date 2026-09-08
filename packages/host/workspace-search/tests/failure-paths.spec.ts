/**
 * LocalWorkspaceSearch failure paths a real ripgrep run cannot deterministically
 * produce: the child exiting with the hard-error code 2. The subprocess seam is
 * stubbed to report that outcome directly.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalWorkspaceSearch from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('LocalWorkspaceSearch failure paths', () => {
  it('rejects when ripgrep exits with the error code', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const handle = {
      pid: 4242,
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      collected: {},
      done: Promise.resolve({ exitCode: 2, signal: null }),
      terminate() {},
      waitForExit: async () => true,
    }
    ctx.provide('subprocess', { spawn: () => handle } as never)
    await ctx.plugin(LocalWorkspaceSearch)
    const service = ctx.get('workspaceSearch')
    if (service === undefined) throw new Error('workspaceSearch did not register')
    await expect(service.search('/workspace/demo', 'hello')).rejects.toThrow(/ripgrep failed to search the workspace/)
  })
})
