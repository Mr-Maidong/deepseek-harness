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

function useRoot(listDirectory: FileTreeProps['listDirectory'], rootPath: string | undefined): DirectoryListing | null | undefined {
  const [listing, setListing] = useState<DirectoryListing | null | undefined>()
  useEffect(() => {
    if (rootPath === undefined) { setListing(undefined); return }
    const controller = new AbortController()
    setListing(undefined)
    void listDirectory(rootPath, controller.signal).then(setListing).catch(() => {
      if (!controller.signal.aborted) setListing(null)
    })
    return () => { controller.abort() }
  }, [listDirectory, rootPath])
  return listing
}

export function FileTree(props: FileTreeProps): React.ReactElement {
  const { listDirectory, rootPath, t, readFile, onPreview, expandedPaths, onToggleExpanded, openPath } = props
  const listing = useRoot(listDirectory, rootPath)
  const expanded = useMemo(() => new Set(expandedPaths), [expandedPaths])
  const listings = useRef(new Map<string, DirectoryListing>())
  const [, setLoadedTick] = useState(0)
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
    for (const path of expanded) {
      if (listings.current.has(path)) continue
      void listDirectory(path).then((result) => {
        listings.current.set(path, result)
        setLoadedTick(tick => tick + 1)
      }).catch(() => {})
    }
  }, [expanded, listDirectory])
  if (listing !== undefined && listing !== null) listings.current.set(listing.path, listing)
  if (rootPath === undefined) return <div className={css.empty}>{t('fileTree.empty')}</div>
  if (listing === undefined) return <div className={css.empty}>{t('fileTree.loading')}</div>
  if (listing === null) return <div className={css.empty}>{t('fileTree.error')}</div>
  return <div className={css.tree}>
    <DirRow
      path={listing.path}
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
