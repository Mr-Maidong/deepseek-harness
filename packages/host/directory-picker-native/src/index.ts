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

import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { DirectoryPicker } from '@deepseek-ai/dsh-host-directory-picker'
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
          kind: entry.isDirectory() || (entry.isSymbolicLink() && (await stat(resolve(target, entry.name))).isDirectory()) ? 'directory' as const : 'file' as const,
        }))),
        truncated: false,
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
