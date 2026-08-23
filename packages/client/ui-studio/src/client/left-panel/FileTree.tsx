/**
 * FileTree: a read-only directory tree over the current session's
 * workspace path. Each level is fetched lazily through
 * `ctx.workspaces.listDirectory` (the Host browse capability lists
 * directories with breadcrumb ancestry); expanding a directory scans it,
 * collapsing prunes the subtree. File entries are a future host extension —
 * today the tree is directory navigation only.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import { ChevronIcon, FolderIcon } from './icons/icons.tsx'
import { NS } from './locales.ts'
import css from './FileTree.module.css'

/** Full composed props for the file-tree view. */
export type FileTreeProps = PropsRuntime<'studio.workspace'> & PropsLocale<typeof NS> & {
  /** List one directory level (absent path = the Host home directory). */
  listDirectory: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  /** The root directory to browse (current workspace path), or undefined. */
  rootPath: string | undefined
}

/** Root-level load state: undefined while loading, null on failure. */
function useRoot(listDirectory: FileTreeProps['listDirectory'], rootPath: string | undefined): DirectoryListing | null | undefined {
  const [listing, setListing] = useState<DirectoryListing | null | undefined>(undefined)
  useEffect(() => {
    if (rootPath === undefined) { setListing(undefined); return }
    let cancelled = false
    const controller = new AbortController()
    setListing(undefined)
    void listDirectory(rootPath, controller.signal)
      .then((result) => { if (!cancelled) setListing(result) })
      .catch(() => { if (!cancelled) setListing(null) })
    return () => { cancelled = true; controller.abort() }
  }, [listDirectory, rootPath])
  return listing
}

/**
 * The file-tree body: a lazy directory tree rooted at the session workspace.
 * Expanded paths live in local state; their listings are fetched on first
 * expansion and retained in a ref so collapsing and re-expanding is instant.
 */
export function FileTree(props: FileTreeProps): React.ReactElement {
  const { listDirectory, rootPath, t } = props
  const listing = useRoot(listDirectory, rootPath)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const listings = useRef(new Map<string, DirectoryListing>())
  const pending = useRef(new Set<string>())

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  // Fetch a level the first time its path is expanded.
  useEffect(() => {
    for (const path of expanded) {
      if (listings.current.has(path) || pending.current.has(path)) continue
      pending.current.add(path)
      const controller = new AbortController()
      void listDirectory(path, controller.signal)
        .then((result) => {
          listings.current.set(path, result)
          // Force a re-render so the retained listing appears.
          setExpanded(prev => new Set(prev))
        })
        .catch(() => {
        // A failed expansion has no recoverable local state; the next toggle retries it.
        })
        .finally(() => { pending.current.delete(path) })
    }
  }, [expanded, listDirectory])

  // Keep the root listing in the shared map so the root row can expand.
  if (listing !== undefined && listing !== null) {
    listings.current.set(rootPath as string, listing)
  }

  if (rootPath === undefined) {
    return <div className={css.empty}>{t('fileTree.empty')}</div>
  }
  if (listing === undefined) {
    return <div className={css.empty}>{t('fileTree.loading')}</div>
  }
  if (listing === null) {
    return <div className={css.empty}>{t('fileTree.error')}</div>
  }

  return (
    <div className={css.tree}>
      <DirRow path={listing.path} name={listing.path} depth={0} expanded={expanded} onToggle={toggle} listings={listings.current} />
    </div>
  )
}

/** One directory row; expanded rows render their children recursively. */
function DirRow({ path, name, depth, expanded, onToggle, listings }: {
  path: string
  name: string
  depth: number
  expanded: ReadonlySet<string>
  onToggle: (path: string) => void
  listings: Map<string, DirectoryListing>
}): React.ReactElement {
  const isExpanded = expanded.has(path)
  const children = listings.get(path)
  return (
    <div className={css.row} style={{ paddingLeft: depth * 14 }}>
      <button type="button" className={css.dirButton} onClick={() => { onToggle(path) }} aria-expanded={isExpanded}>
        <ChevronIcon open={isExpanded} className={css.chevron} />
        <FolderIcon open={isExpanded} className={css.dirIcon} />
        <span className={css.dirName}>{name}</span>
      </button>
      {isExpanded && (
        <div className={css.children}>
          {children !== undefined && children.entries.length === 0 && <div className={css.emptySub} />}
          {children !== undefined && children.entries.map(entry => (
            <DirRow
              key={entry.path}
              path={entry.path}
              name={entry.name}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              listings={listings}
            />
          ))}
        </div>
      )}
    </div>
  )
}
