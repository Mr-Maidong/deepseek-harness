import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import type { StudioPreview, StudioPreviewKind } from '../frame/contract.ts'
import { ChevronIcon, FolderIcon } from './icons/icons.tsx'
import { NS } from './locales.ts'
import css from './FileTree.module.css'

type FileContent = { path: string; content: string; language?: string }
export type FileTreeProps = PropsRuntime<'studio.workspace'> & PropsLocale<typeof NS> & {
  listDirectory: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  rootPath: string | undefined
  readFile: (path: string) => Promise<FileContent>
  onPreview: (preview: StudioPreview) => void
  /** Directory paths whose children are expanded, owned by the workspace store. */
  expandedPaths: readonly string[]
  onToggleExpanded: (path: string) => void
  /** Path of the file currently shown in the preview card, or undefined. */
  openPath?: string | undefined
}

/**
 * The workspace directory tree. A folder is listed when it opens — including
 * when it re-opens after a collapse — and opening one re-lists every folder
 * still held open beneath it, so a collapsed subtree never comes back with
 * stale entries. Expansion itself is owned by the caller through the
 * workspace store.
 * @param props the locale seat plus the injected directory reads and the store-owned expansion.
 * @returns the tree for the open workspace, or the prompt to pick one.
 */
export function FileTree(props: FileTreeProps): React.ReactElement {
  const { listDirectory, rootPath, t, readFile, onPreview, expandedPaths, onToggleExpanded, openPath } = props
  const expanded = useMemo(() => new Set(expandedPaths), [expandedPaths])
  const listings = useRef(new Map<string, DirectoryListing>())
  /** Paths with a read in flight; a second request for one of them is redundant. */
  const pending = useRef(new Set<string>())
  /** The expanded set as of the previous effect run, to tell a fresh open from a re-render. */
  const openDirs = useRef<ReadonlySet<string>>(new Set())
  const [, setLoadedTick] = useState(0)
  // The root's failure is the only panel-level state: a directory that has never
  // been listed leaves its own row empty.
  const [rootFailed, setRootFailed] = useState(false)
  const read = useCallback((path: string, signal?: AbortSignal): Promise<void> => {
    if (pending.current.has(path)) return Promise.resolve()
    pending.current.add(path)
    return listDirectory(path, signal).then(
      (listing) => {
        listings.current.set(path, listing)
        if (path === rootPath) setRootFailed(false)
        setLoadedTick(tick => tick + 1)
      },
      () => {
        // A cancelled or failed read keeps whatever listing is already on screen.
        if (signal?.aborted) return
        if (path === rootPath && !listings.current.has(path)) setRootFailed(true)
      },
    ).finally(() => { pending.current.delete(path) })
  }, [listDirectory, rootPath])
  const toggle = useCallback((path: string) => { onToggleExpanded(path) }, [onToggleExpanded])
  const onFile = useCallback((path: string) => {
    // Rendered artifacts whose source should be embedded directly (e.g. HTML
    // that the model produced) open in the iframe card; everything else shows
    // as code. Default to code so unknown formats stay safe.
    const kind: StudioPreviewKind = path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm') ? 'iframe' : 'code'
    // The card opens immediately in its loading state; the tree keeps
    // rendering while the read travels to the floating preview.
    onPreview({ path, status: 'loading', kind })
    void readFile(path).then(({ content, language }) => {
      onPreview({ path, status: 'ready', content, kind, ...(language === undefined ? {} : { language }) })
    }).catch(() => {
      onPreview({ path, status: 'error', kind })
    })
  }, [onPreview, readFile])
  useEffect(() => {
    if (rootPath === undefined) return
    const controller = new AbortController()
    setRootFailed(false)
    void read(rootPath, controller.signal)
    return () => { controller.abort() }
  }, [read, rootPath])
  useEffect(() => {
    // A folder is re-read when it opens again or was never listed, and opening
    // one re-reads every folder still held open under it: a collapsed subtree
    // must not come back with the entries it had before the collapse.
    const reopened = [...expanded].filter(path => !openDirs.current.has(path) || !listings.current.has(path))
    openDirs.current = expanded
    for (const path of expanded) {
      if (reopened.some(root => path === root || path.startsWith(`${root}/`))) void read(path)
    }
  }, [expanded, read])
  if (rootPath === undefined) return <div className={css.empty}>{t('fileTree.empty')}</div>
  const listing = listings.current.get(rootPath)
  if (listing === undefined) return <div className={css.empty}>{rootFailed ? t('fileTree.error') : t('fileTree.loading')}</div>
  return <div className={css.tree}>
    <DirRow
      path={rootPath}
      name={listing.path}
      depth={0}
      expanded={expanded}
      onToggle={toggle}
      listings={listings.current}
      onFile={onFile}
      openPath={openPath}
    />
  </div>
}

type DirRowProps = {
  path: string
  name: string
  depth: number
  expanded: ReadonlySet<string>
  onToggle: (path: string) => void
  listings: Map<string, DirectoryListing>
  onFile: (path: string) => void
  openPath?: string | undefined
}
function DirRow({ path, name, depth, expanded, onToggle, listings, onFile, openPath }: DirRowProps): React.ReactElement {
  const children = listings.get(path)
  const open = expanded.has(path)
  return <div className={css.row} style={{ paddingLeft: depth * 6 }}>
    <button type="button" className={css.dirButton} onClick={() => { onToggle(path) }} aria-expanded={open}>
      <ChevronIcon open={open} className={css.chevron} />
      <FolderIcon open={open} className={css.dirIcon} />
      <span className={css.dirName}>{name}</span>
    </button>
    <div className={css.children} data-expanded={open || undefined}><div className={css.childrenContent}>
      {children?.entries.map(entry => entry.kind === 'directory'
        ? <DirRow key={entry.path} path={entry.path} name={entry.name} depth={depth + 1}
          expanded={expanded} onToggle={onToggle} listings={listings} onFile={onFile} openPath={openPath} />
        : <FileRow key={entry.path} path={entry.path} name={entry.name} depth={depth + 1}
          onFile={onFile} openPath={openPath} />)}
    </div></div>
  </div>
}

type FileRowProps = { path: string; name: string; depth: number; onFile: (path: string) => void; openPath?: string | undefined }
function FileRow({ path, name, depth, onFile, openPath }: FileRowProps): React.ReactElement {
  return <div className={css.row} style={{ paddingLeft: depth * 6 }}>
    <button type="button" className={css.fileRow} data-open={path === openPath || undefined} onClick={() => { onFile(path) }}>
      <span className={css.fileGlyph} aria-hidden="true" /><span className={css.fileName}>{name}</span>
    </button>
  </div>
}
