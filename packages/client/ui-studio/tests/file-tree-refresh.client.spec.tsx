// @vitest-environment jsdom
// Directory reads in the file tree: opening a folder re-reads it, opening a
// folder re-reads everything still held open under it, and a re-render that
// changes nothing issues no request.
import type {} from '../src/client/index.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FileTree } from '../src/client/left-panel/FileTree.tsx'
import { zh } from '../src/client/left-panel/locales.ts'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'

const t = makeTranslate(zh) as never
const globalStandardProps = {
  useSessions: () => undefined,
  useWorkspaces: () => undefined,
  useSessionPendingInteraction: () => undefined,
} as unknown as ComponentProps<typeof FileTree>

/** One directory listing keyed by its own path, with the given folder-then-file children. */
function dirListing(path: string, files: string[], dirs: string[] = []): DirectoryListing {
  return {
    path,
    home: '/workspace',
    crumbs: [],
    truncated: false,
    entries: [
      ...dirs.map(name => ({ kind: 'directory' as const, name, path: `${path}/${name}`, hidden: false })),
      ...files.map(name => ({ kind: 'file' as const, name, path: `${path}/${name}`, hidden: false })),
    ],
  }
}

/** The workspace root: folders `src` and `docs`, no files of its own. */
function workspaceRoot(): DirectoryListing {
  return dirListing('/workspace', [], ['src', 'docs'])
}

/**
 * A lister over a fixed path table. A path the table omits reads as an empty
 * directory, so a listing that names a folder never recurses.
 */
function lister(table: Record<string, () => DirectoryListing>): ReturnType<typeof vi.fn> {
  return vi.fn(async (path?: string) => {
    const read = table[path ?? '']
    return read !== undefined ? read() : dirListing(path ?? '', [])
  })
}

/** How many requests one directory has received. */
function callsFor(listDirectory: ReturnType<typeof vi.fn>, path: string): number {
  return listDirectory.mock.calls.filter(([requested]: unknown[]) => requested === path).length
}

function tree(listDirectory: ReturnType<typeof vi.fn>, expandedPaths: string[], onToggleExpanded = vi.fn(), rootPath: string | null = '/workspace') {
  return <FileTree
    {...globalStandardProps}
    t={t}
    activeSection="project"
    rootPath={(rootPath ?? undefined) as never}
    listDirectory={listDirectory as never}
    readFile={vi.fn()}
    onPreview={vi.fn()}
    expandedPaths={expandedPaths}
    onToggleExpanded={onToggleExpanded as never}
  />
}

/** Render collapsed; the returned function re-renders with a freshly-built array. */
function renderTree(listDirectory: ReturnType<typeof vi.fn>) {
  const view = render(tree(listDirectory, []))
  return (expandedPaths: string[] = []) => { view.rerender(tree(listDirectory, [...expandedPaths])) }
}

/** Let the reads already in flight settle, including their state updates. */
async function settled(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

afterEach(cleanup)

describe('file-tree directory reads', () => {
  it('lists the workspace root and its expanded folders', async () => {
    const listDirectory = lister({
      '/workspace': workspaceRoot,
      '/workspace/src': () => dirListing('/workspace/src', ['inner.ts']),
    })
    const rerender = renderTree(listDirectory)
    rerender(['/workspace', '/workspace/src'])
    expect(await screen.findByRole('button', { name: 'inner.ts' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'src' })).toBeTruthy()
  })

  it('re-reads a folder when it is expanded again', async () => {
    let rootRound = 0
    const listDirectory = lister({
      '/workspace': () => dirListing('/workspace', [`root-${++rootRound}.ts`]),
    })
    const rerender = renderTree(listDirectory)
    rerender(['/workspace'])
    expect(await screen.findByRole('button', { name: 'root-1.ts' })).toBeTruthy()
    await settled()
    rerender([])
    rerender(['/workspace'])
    await vi.waitFor(() => { expect(screen.queryByRole('button', { name: 'root-1.ts' })).toBeNull() })
    expect(screen.getByRole('button', { name: 'root-2.ts' })).toBeTruthy()
  })

  it('re-reads an open folder when its parent is expanded again', async () => {
    let srcRound = 0
    const listDirectory = lister({
      '/workspace': workspaceRoot,
      '/workspace/src': () => dirListing('/workspace/src', [`v${++srcRound}.ts`]),
    })
    const rerender = renderTree(listDirectory)
    rerender(['/workspace', '/workspace/src'])
    expect(await screen.findByRole('button', { name: 'v1.ts' })).toBeTruthy()
    // Collapsing the root leaves src in the store; reopening the root refreshes the subtree.
    rerender(['/workspace/src'])
    rerender([])
    rerender(['/workspace', '/workspace/src'])
    await vi.waitFor(() => { expect(screen.queryByRole('button', { name: 'v1.ts' })).toBeNull() })
    expect(screen.getByRole('button', { name: 'v2.ts' })).toBeTruthy()
    expect(callsFor(listDirectory, '/workspace/src')).toBe(2)
  })

  it('does not re-read while the expansion state is unchanged', async () => {
    const listDirectory = lister({
      '/workspace': workspaceRoot,
      '/workspace/src': () => dirListing('/workspace/src', ['inner.ts']),
    })
    const rerender = renderTree(listDirectory)
    rerender(['/workspace', '/workspace/src'])
    expect(await screen.findByRole('button', { name: 'inner.ts' })).toBeTruthy()
    rerender(['/workspace', '/workspace/src'])
    rerender(['/workspace', '/workspace/src'])
    await settled()
    expect(callsFor(listDirectory, '/workspace/src')).toBe(1)
    expect(callsFor(listDirectory, '/workspace')).toBe(1)
  })

  it('retries a folder whose read failed once anything else expands', async () => {
    let srcAttempts = 0
    const listDirectory = lister({
      '/workspace': workspaceRoot,
      '/workspace/src': () => {
        srcAttempts += 1
        if (srcAttempts === 1) throw new Error('EIO')
        return dirListing('/workspace/src', ['recovered.ts'])
      },
    })
    const rerender = renderTree(listDirectory)
    rerender(['/workspace', '/workspace/src'])
    await vi.waitFor(() => { expect(srcAttempts).toBe(1) })
    await settled()
    expect(screen.queryByText('recovered.ts')).toBeNull()
    rerender(['/workspace', '/workspace/src', '/workspace/docs'])
    expect(await screen.findByRole('button', { name: 'recovered.ts' })).toBeTruthy()
    expect(srcAttempts).toBe(2)
  })

  it('reports a root that cannot be listed and recovers on the next expand', async () => {
    let attempts = 0
    const listDirectory = lister({
      '/workspace': () => {
        attempts += 1
        if (attempts === 1) throw new Error('EACCES')
        return dirListing('/workspace', ['back.ts'])
      },
    })
    const rerender = renderTree(listDirectory)
    expect(await screen.findByText('无法读取此目录')).toBeTruthy()
    await settled()
    rerender(['/workspace'])
    expect(await screen.findByRole('button', { name: 'back.ts' })).toBeTruthy()
  })

  it('keeps the listed rows when a refresh fails', async () => {
    let attempts = 0
    const listDirectory = lister({
      '/workspace': workspaceRoot,
      '/workspace/src': () => {
        attempts += 1
        if (attempts > 1) throw new Error('EIO')
        return dirListing('/workspace/src', ['kept.ts'])
      },
    })
    const rerender = renderTree(listDirectory)
    rerender(['/workspace', '/workspace/src'])
    expect(await screen.findByRole('button', { name: 'kept.ts' })).toBeTruthy()
    await settled()
    rerender(['/workspace'])
    rerender(['/workspace', '/workspace/src'])
    await vi.waitFor(() => { expect(attempts).toBe(2) })
    expect(screen.getByRole('button', { name: 'kept.ts' })).toBeTruthy()
  })

  it('ignores a root read that a workspace switch cancelled', async () => {
    const listDirectory = vi.fn((path?: string, signal?: AbortSignal) => path === '/old'
      ? new Promise<DirectoryListing>((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
      })
      : Promise.resolve(dirListing(path ?? '', ['fresh.ts'])))
    const view = render(tree(listDirectory, [], vi.fn(), '/old'))
    expect(await screen.findByText('加载中…')).toBeTruthy()
    view.rerender(tree(listDirectory, [], vi.fn(), '/new'))
    expect(await screen.findByRole('button', { name: 'fresh.ts' })).toBeTruthy()
    await settled()
    expect(screen.queryByText('无法读取此目录')).toBeNull()
  })

  it('prompts for a workspace and reads nothing while none is open', () => {
    const listDirectory = lister({})
    render(tree(listDirectory, [], vi.fn(), null))
    expect(screen.getByText('选择工作区以浏览其文件')).toBeTruthy()
    expect(listDirectory).not.toHaveBeenCalled()
  })

  it('asks the workspace store to toggle a folder and lists it on the way in', async () => {    const onToggleExpanded = vi.fn()
    const listDirectory = lister({
      '/workspace': workspaceRoot,
      '/workspace/src': () => dirListing('/workspace/src', ['inner.ts']),
    })
    const view = render(tree(listDirectory, [], onToggleExpanded))
    const src = await screen.findByRole('button', { name: 'src' })
    fireEvent.click(src)
    expect(onToggleExpanded).toHaveBeenCalledWith('/workspace/src')
    view.rerender(tree(listDirectory, ['/workspace/src'], onToggleExpanded))
    expect(await screen.findByRole('button', { name: 'inner.ts' })).toBeTruthy()
    expect(callsFor(listDirectory, '/workspace/src')).toBe(1)
  })
})
