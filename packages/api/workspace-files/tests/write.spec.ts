/**
 * The guarded workspace write: one existing regular file inside the workspace
 * root, bounded by the full-file cap, and refused when the version the caller
 * read is no longer current.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => { harness = await openWorkspace('dsh-workspace-files-write-') })
afterEach(async () => { await harness.dispose() })

describe('workspaceFiles.write', () => {
  it('replaces the complete file and reports the version it produced', async () => {
    await writeFile(join(harness.workspace, 'note.txt'), 'before')
    const files = harness.endpoint()
    const written = await files.write(harness.scope, 'note.txt', { text: 'after\n' }, signal())
    expect(await readFile(join(harness.workspace, 'note.txt'), 'utf8')).toBe('after\n')
    expect(written).toMatchObject({ bytes: 6 })
    expect(written.absolutePath.endsWith('note.txt')).toBe(true)
    expect(written.version).not.toBe('')
  })

  it('replaces the file when the observed version still matches', async () => {
    await writeFile(join(harness.workspace, 'guarded.txt'), 'one')
    const files = harness.endpoint()
    const observed = await files.stat(harness.scope, 'guarded.txt', signal())
    await files.write(harness.scope, 'guarded.txt', { text: 'two', version: observed.version }, signal())
    expect(await readFile(join(harness.workspace, 'guarded.txt'), 'utf8')).toBe('two')
  })

  it('overwrites unconditionally when no version is given', async () => {
    await writeFile(join(harness.workspace, 'unguarded.txt'), 'one')
    const files = harness.endpoint()
    await writeFile(join(harness.workspace, 'unguarded.txt'), 'changed behind the caller')
    await files.write(harness.scope, 'unguarded.txt', { text: 'two' }, signal())
    expect(await readFile(join(harness.workspace, 'unguarded.txt'), 'utf8')).toBe('two')
  })

  it('refuses a stale version and leaves the file untouched', async () => {
    await writeFile(join(harness.workspace, 'stale.txt'), 'one')
    const files = harness.endpoint()
    const observed = await files.stat(harness.scope, 'stale.txt', signal())
    await writeFile(join(harness.workspace, 'stale.txt'), 'two')
    expect(await failureOf(files.write(harness.scope, 'stale.txt', { text: 'three', version: observed.version }, signal())))
      .toEqual({ code: 'workspace-file/version-conflict', details: { path: 'stale.txt' } })
    expect(await readFile(join(harness.workspace, 'stale.txt'), 'utf8')).toBe('two')
  })

  it('refuses content above the full-file cap without touching the file', async () => {
    await writeFile(join(harness.workspace, 'big.txt'), 'small')
    expect(await failureOf(harness.endpoint({ maxFileBytes: 4 }).write(harness.scope, 'big.txt', { text: 'abcde' }, signal())))
      .toEqual({ code: 'workspace-file/too-large', details: { path: 'big.txt', limit: 4 } })
    expect(await readFile(join(harness.workspace, 'big.txt'), 'utf8')).toBe('small')
  })

  it('counts the cap in UTF-8 bytes, not characters', async () => {
    await writeFile(join(harness.workspace, 'wide.txt'), 'x')
    expect((await failureOf(harness.endpoint({ maxFileBytes: 2 }).write(harness.scope, 'wide.txt', { text: '引入' }, signal()))).code)
      .toBe('workspace-file/too-large')
  })

  it('refuses a path outside the workspace root', async () => {
    await writeFile(join(harness.outside, 'outside.txt'), 'outside')
    const path = join(harness.outside, 'outside.txt')
    expect(await failureOf(harness.endpoint().write(harness.scope, path, { text: 'inside now' }, signal())))
      .toEqual({ code: 'workspace-file/outside-workspace', details: { path } })
    expect(await readFile(path, 'utf8')).toBe('outside')
  })

  it('refuses a symlink instead of writing through it', async () => {
    await writeFile(join(harness.workspace, 'target.txt'), 'target')
    await symlink('target.txt', join(harness.workspace, 'link.txt'))
    expect(await failureOf(harness.endpoint().write(harness.scope, 'link.txt', { text: 'through' }, signal())))
      .toEqual({ code: 'workspace-file/not-regular-file', details: { path: 'link.txt', kind: 'symlink' } })
    expect(await readFile(join(harness.workspace, 'target.txt'), 'utf8')).toBe('target')
  })

  it('refuses a directory and a missing file, creating nothing', async () => {
    await mkdir(join(harness.workspace, 'directory'))
    const files = harness.endpoint()
    expect((await failureOf(files.write(harness.scope, 'directory', { text: 'x' }, signal()))).code)
      .toBe('workspace-file/not-regular-file')
    expect(await failureOf(files.write(harness.scope, 'new.txt', { text: 'x' }, signal())))
      .toEqual({ code: 'workspace-file/not-found', details: { path: 'new.txt' } })
    await expect(readFile(join(harness.workspace, 'new.txt'), 'utf8')).rejects.toThrow()
  })

  it('writes an empty file', async () => {
    await writeFile(join(harness.workspace, 'empty.txt'), 'content')
    await harness.endpoint().write(harness.scope, 'empty.txt', { text: '' }, signal())
    expect(await readFile(join(harness.workspace, 'empty.txt'), 'utf8')).toBe('')
  })
})
