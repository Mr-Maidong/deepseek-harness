// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createFileTreeStore } from '../src/client/left-panel/file-tree-store.ts'

describe('file tree store', () => {
  beforeEach(() => { localStorage.clear() })

  it('toggles a directory path in and out of the expansion set', () => {
    const store = createFileTreeStore().create()
    expect(store.getSnapshot().expandedPaths).toEqual([])
    store.actions.toggleExpanded('/workspace/src')
    expect(store.getSnapshot().expandedPaths).toEqual(['/workspace/src'])
    store.actions.toggleExpanded('/workspace/src')
    expect(store.getSnapshot().expandedPaths).toEqual([])
  })

  it('persists expanded paths and restores them on the next instance', () => {
    const store = createFileTreeStore().create()
    store.actions.toggleExpanded('/workspace/src')
    store.actions.toggleExpanded('/workspace/src/nested')
    const revived = createFileTreeStore().create()
    expect(revived.getSnapshot().expandedPaths).toEqual(['/workspace/src', '/workspace/src/nested'])
  })

  it('persists the section toggles and restores them on the next instance', () => {
    const store = createFileTreeStore().create()
    expect(store.getSnapshot().sections).toEqual({ workBase: true, fileTree: true })
    store.actions.toggleSection('workBase')
    const revived = createFileTreeStore().create()
    expect(revived.getSnapshot().sections).toEqual({ workBase: false, fileTree: true })
  })
})
