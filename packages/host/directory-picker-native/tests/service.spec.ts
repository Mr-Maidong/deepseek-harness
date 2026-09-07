/**
 * Behavior of the native backend's cordis half: registration plus the
 * read-only `list`/`readText` capability members a file-tree consumer drives,
 * over a real temporary directory tree.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DirectoryPickerError } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryPickerNativeCapability } from '@deepseek-ai/dsh-host-directory-picker'
import NativeDirectoryPicker from '../src/index.ts'

let root: string
let capability: DirectoryPickerNativeCapability
let dispose: () => Promise<void>

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-native-'))
  await mkdir(join(root, 'projects'))
  await mkdir(join(root, '.hidden-dir'))
  await writeFile(join(root, 'notes.txt'), 'not a directory')
  await writeFile(join(root, 'big.txt'), 'x'.repeat(1024 * 1024 + 1))
  await symlink(join(root, 'projects'), join(root, 'linked'), 'junction')
  await symlink(join(root, 'gone'), join(root, 'broken'), 'junction')
  try {
    await symlink(join(root, 'notes.txt'), join(root, 'file-link'))
  } catch {
    // Windows denies unprivileged file symlinks; the POSIX lanes own that arm.
  }

  const ctx = new Context()
  const fiber = ctx.plugin(NativeDirectoryPicker)
  await fiber.await()
  const picked = ctx.get('directoryPicker')!.capability()
  if (picked.kind !== 'native') throw new Error('native backend must advertise the native capability')
  capability = picked
  dispose = () => fiber.dispose()
})

afterAll(async () => {
  await dispose()
  await rm(root, { recursive: true, force: true })
})

describe('NativeDirectoryPicker', () => {
  it('registers ctx.directoryPicker with a stable native capability and leaves with its fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(NativeDirectoryPicker)
    await fiber.await()
    const picker = ctx.get('directoryPicker')
    expect(picker).toBeInstanceOf(NativeDirectoryPicker)
    const capability = picker!.capability()
    expect(capability.kind).toBe('native')
    // Stability: consumers may capture the capability object across calls.
    expect(picker!.capability()).toBe(capability)
    await fiber.dispose()
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })

  it('lists a level with ancestry, distinguishing directories, files, and hidden rows', async () => {
    const listing = await capability.list!(root)
    expect(listing.path).toBe(root)
    expect(listing.home).toBe(homedir())
    expect(listing.truncated).toBe(false)
    // The breadcrumb chain ends at the listed directory.
    expect(listing.crumbs.at(-1)).toMatchObject({ name: basename(root), path: root })
    const byName = new Map(listing.entries.map(entry => [entry.name, entry]))
    expect(byName.get('projects')!.kind).toBe('directory')
    // A symlink to a directory follows through stat; one to a file stays a file.
    expect(byName.get('linked')!.kind).toBe('directory')
    expect(byName.get('notes.txt')!.kind).toBe('file')
    // A broken symlink stays a file row instead of making the level unreadable.
    expect(byName.get('broken')!.kind).toBe('file')
    expect(byName.get('.hidden-dir')!.hidden).toBe(true)
    expect(byName.get('projects')!.hidden).toBe(false)
    // Every entry path is absolute and host-joined — clients never join segments.
    expect(listing.entries.every(entry => entry.path === join(root, entry.name))).toBe(true)
    if (byName.has('file-link')) expect(byName.get('file-link')!.kind).toBe('file')
  })

  it('lists the home directory when no path is given', async () => {
    const listing = await capability.list!()
    expect(listing.path).toBe(homedir())
  })

  it('stops a listing with the caller: an aborted signal rejects with its own reason', async () => {
    const gone = new AbortController()
    gone.abort(new Error('caller left'))
    await expect(capability.list!(root, gone.signal)).rejects.toThrow('caller left')
    // A live signal leaves a normal listing untouched.
    const live = new AbortController()
    await expect(capability.list!(root, live.signal)).resolves.toMatchObject({ path: root })
  })

  it('reads bounded regular UTF-8 files, with and without a caller signal', async () => {
    await expect(capability.readText!(join(root, 'notes.txt'))).resolves.toBe('not a directory')
    const live = new AbortController()
    await expect(capability.readText!(join(root, 'notes.txt'), live.signal)).resolves.toBe('not a directory')
  })

  it('refuses directories, oversized files, and symlink previews with directory-unreadable', async () => {
    const asDirectory = await capability.readText!(root).catch((error: unknown) => error)
    expect(asDirectory).toBeInstanceOf(DirectoryPickerError)
    expect((asDirectory as DirectoryPickerError).code).toBe('directory-unreadable')
    const oversized = await capability.readText!(join(root, 'big.txt')).catch((error: unknown) => error)
    expect((oversized as DirectoryPickerError).code).toBe('directory-unreadable')
    // Where the file symlink exists (POSIX; Windows denies unprivileged file
    // links), the symlink arm refuses it; where it does not, the missing
    // path lands in the same directory-unreadable code.
    const asSymlink = await capability.readText!(join(root, 'file-link')).catch((error: unknown) => error)
    expect((asSymlink as DirectoryPickerError).code).toBe('directory-unreadable')
  })

  it('reports an unreadable preview path with directory-unreadable, signal or not', async () => {
    const missing = join(root, 'no-such.txt')
    const failure = await capability.readText!(missing).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DirectoryPickerError)
    expect((failure as DirectoryPickerError).code).toBe('directory-unreadable')
    expect((failure as DirectoryPickerError).path).toBe(missing)
    const live = new AbortController()
    await expect(capability.readText!(missing, live.signal)).rejects.toBeInstanceOf(DirectoryPickerError)
  })

  it('refuses a read whose caller already departed', async () => {
    const gone = new AbortController()
    gone.abort(new Error('caller left'))
    await expect(capability.readText!(join(root, 'notes.txt'), gone.signal)).rejects.toThrow('caller left')
  })
})
