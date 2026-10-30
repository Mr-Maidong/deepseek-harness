import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import * as SessionLogDownload from '../src/index.ts'

describe('Web export commands', () => {
  it('registers pathless /export and /copy commands and removes both with the plugin fiber', async () => {
    const descriptors = new Map<string, CommandDefinition>()
    const ctx = new Context()
    ctx.provide('commands', {
      register(next: CommandDefinition) {
        descriptors.set(next.name, next)
        return () => { descriptors.delete(next.name) }
      },
    } as never)
    ctx.provide('connection', {
      fetch: { register: () => () => Promise.resolve() },
    } as never)
    const fiber = await ctx.plugin(SessionLogDownload)

    const downloadCommand = descriptors.get('export')
    expect(downloadCommand).toMatchObject({
      name: 'export',
      description: 'Download this Session log as a ZIP archive',
    })
    const invokeDownload = (rawInput: string) => downloadCommand?.handler({ rawInput } as CommandInvocation)
    await expect(invokeDownload('')).resolves.toEqual({
      kind: 'success', text: 'Session log download requested.',
    })
    await expect(invokeDownload(' output.zip')).resolves.toEqual({
      kind: 'error', text: 'The Web /export command does not accept a path.',
    })

    const copyCommand = descriptors.get('copy')
    expect(copyCommand).toMatchObject({
      name: 'copy',
      description: 'Copy this Session transcript as Markdown',
    })
    const invokeCopy = (rawInput: string) => copyCommand?.handler({ rawInput } as CommandInvocation)
    await expect(invokeCopy('')).resolves.toEqual({
      kind: 'success', text: 'Session Markdown copy requested.',
    })
    await expect(invokeCopy(' notes.md')).resolves.toEqual({
      kind: 'error', text: 'The Web /copy command does not accept a path.',
    })

    await fiber.dispose()
    expect(descriptors.size).toBe(0)
  })
})
