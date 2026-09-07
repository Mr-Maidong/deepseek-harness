/**
 * Native backend of the directory-picker seam: registers `ctx.directoryPicker`
 * with the `native` capability, opening one native OS chooser on the host
 * display per pick (macOS `osascript`, Linux Zenity with a KDialog fallback;
 * Windows opens the modern `IFileOpenDialog` in a spawned child process — a
 * koffi-driven COM conversation on the child's main thread). Only viable when
 * the operator sits at the host's screen; remote deployments compose the
 * browse backend instead.
 * @module @deepseek-ai/dsh-host-directory-picker-native
 */

import { lstat, readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { DirectoryPicker, DirectoryPickerError } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryEntry, DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'

function ancestry(target: string): DirectoryEntry[] {
  const crumbs: DirectoryEntry[] = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    crumbs.unshift({ name: parent === current ? current : basename(current), path: current, hidden: false, kind: 'directory' })
    if (parent === current) return crumbs
    current = parent
  }
}

function messageOf(error: unknown): string {
  /* v8 ignore next -- node:fs rejects with Error instances; the String arm only satisfies the unknown narrowing. */
  return error instanceof Error ? error.message : String(error)
}
import { pickNativeDirectory } from './native-picker.ts'

export type { DirectoryPickerInternals, DirectoryPickerRunner } from './native-picker.ts'
export { pickNativeDirectory } from './native-picker.ts'

/** The `ctx.directoryPicker` native implementation (stable capability object per service life). */
export default class NativeDirectoryPicker extends DirectoryPicker {
  private readonly nativeCapability: DirectoryPickerCapability = {
    kind: 'native',
    /* v8 ignore next -- pure forward to pickNativeDirectory (its spec owns behavior); invoking here opens a real chooser. */
    pick: signal => pickNativeDirectory(signal),
    list: async (path, signal) => {
      signal?.throwIfAborted()
      const target = resolve(path ?? homedir())
      const entries = await readdir(target, { withFileTypes: true })
      signal?.throwIfAborted()
      return {
        path: target,
        home: homedir(),
        crumbs: ancestry(target),
        entries: await Promise.all(entries.map(async entry => ({
          name: entry.name,
          path: resolve(target, entry.name),
          hidden: entry.name.startsWith('.'),
          // A broken symlink's stat probe fails; it stays a file row rather
          // than making the whole level unreadable.
          kind: entry.isDirectory() || (entry.isSymbolicLink() && await stat(resolve(target, entry.name)).then(info => info.isDirectory(), () => false)) ? 'directory' as const : 'file' as const,
        }))),
        truncated: false,
      }
    },
    readText: async (path, signal) => {
      signal?.throwIfAborted()
      const target = resolve(path)
      const info = await lstat(target).catch((error: unknown) => {
        signal?.throwIfAborted()
        throw new DirectoryPickerError('directory-unreadable', target, messageOf(error))
      })
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) {
        throw new DirectoryPickerError('directory-unreadable', target, 'file is not a readable preview')
      }
      try {
        return await readFile(target, 'utf8')
      } catch (error: unknown) {
        /* v8 ignore start -- an inode replaced between lstat and read is not producible; the controller spec pins the wire failure. */
        signal?.throwIfAborted()
        throw new DirectoryPickerError('directory-unreadable', target, messageOf(error))
        /* v8 ignore stop */
      }
    },
  }

  /**
   * The native interaction capability.
   * @returns the stable `native` capability object.
   */
  capability(): DirectoryPickerCapability {
    return this.nativeCapability
  }
}
