/** Persisted file-tree expansion state for the Studio workspace panel. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

type FileTreeState = {
  /** Directory paths whose children are expanded, in toggle order. */
  expandedPaths: string[]
  /** Expand/collapse state of the panel sections, persisted per reload. */
  sections: { workBase: boolean; fileTree: boolean }
}

type FileTreeActions = {
  toggleExpanded: (draft: FileTreeState, path: string) => void
  toggleSection: (draft: FileTreeState, section: 'workBase' | 'fileTree') => void
}

/**
 * Root-scoped store for the file tree's folder expansion and the workspace
 * panel's section toggles. Directory paths are kept as a JSON-serializable
 * array (a Set would not survive persistence); toggle order is preserved so
 * the same paths come back in the same order.
 */
export function createFileTreeStore(): EngineStoreHandle<FileTreeState, FileTreeActions> {
  return defineStore({
    init: (): FileTreeState => ({ expandedPaths: [], sections: { workBase: true, fileTree: true } }),
    persist: 'dsh.studio.file-tree-expanded.v1',
    actions: {
      toggleExpanded: (draft, path) => {
        const index = draft.expandedPaths.indexOf(path)
        if (index === -1) draft.expandedPaths.push(path)
        else draft.expandedPaths.splice(index, 1)
      },
      toggleSection: (draft, section) => { draft.sections[section] = !draft.sections[section] },
    },
  })
}
