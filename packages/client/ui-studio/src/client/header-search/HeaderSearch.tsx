/**
 * Workspace search as a Session-header utility: a search trigger at the
 * titleRow's right edge opening a floating results panel (portal into the
 * studio frame node, so the frame-scoped tokens style it like the preview
 * card). The panel hangs right-aligned under the trigger. The query is
 * debounced; a monotonic request id plus an AbortController ensure only the
 * latest request commits its result, so a slow earlier search can never
 * overwrite a newer one. Clicking a result opens the file in the preview card
 * scrolled to the match and closes the panel.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspaceId, WorkspaceSearchResult } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { IconSearchOutline16, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StudioPreview } from '../frame/contract.ts'
import { NS } from './locales.ts'
import css from './HeaderSearch.module.css'

/** Full composed props for the Session-header search entry. */
export type HeaderSearchProps =
  PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & HeaderSearchInjected

/** Search, file-read, and preview operations supplied by the Studio client entry. */
export interface HeaderSearchInjected {
  /** Workspace the Session belongs to, or undefined when unanchored (search disabled). */
  workspaceId: WorkspaceId | undefined
  /** Absolute host directory of that Workspace; result paths are displayed relative to it. */
  workspacePath: string | undefined
  /** Search one Workspace's directory for a plain-text query. */
  searchWorkspace: (
    workspaceId: WorkspaceId,
    query: string,
    signal?: AbortSignal,
  ) => Promise<WorkspaceSearchResult>
  /** Read a file's content for the preview card. */
  readFile: (path: string) => Promise<{ path: string; content: string; language?: string }>
  /** Publish a preview-card state for the current workspace file. */
  onPreview: (preview: StudioPreview) => void
}

/** Milliseconds to wait after the last keystroke before issuing a search. */
const SEARCH_DEBOUNCE_MS = 250

/** Hidden pre-measure mount: the anchored position lands on the next frame. */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

export function HeaderSearch(props: HeaderSearchProps): React.ReactElement {
  const { workspaceId, workspacePath, searchWorkspace, readFile, onPreview, t } = props
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<WorkspaceSearchResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const position = useAnchoredPosition({
    open,
    anchorRef: triggerRef,
    panelRef,
    side: 'bottom',
    align: 'end',
    gap: 6,
    margin: 16,
  })

  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  const cancel = useCallback(() => {
    if (debounceRef.current !== undefined) {
      clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }
    controllerRef.current?.abort()
    controllerRef.current = undefined
  }, [])

  const run = useCallback((value: string) => {
    if (workspaceId === undefined || value.trim() === '') {
      setResult(undefined)
      setError(undefined)
      setSearching(false)
      return
    }
    const requestId = ++requestIdRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setSearching(true)
    setError(undefined)
    void searchWorkspace(workspaceId, value, controller.signal).then(
      (next) => {
        if (requestId !== requestIdRef.current) return
        setResult(next)
        setSearching(false)
      },
      (reason: unknown) => {
        if (requestId !== requestIdRef.current) return
        setSearching(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }, [searchWorkspace, workspaceId])

  const onChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current !== undefined) clearTimeout(debounceRef.current)
    if (value.trim() === '') {
      cancel()
      setResult(undefined)
      setError(undefined)
      setSearching(false)
      return
    }
    debounceRef.current = setTimeout(() => { run(value) }, SEARCH_DEBOUNCE_MS)
  }, [cancel, run])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    if (debounceRef.current !== undefined) {
      clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }
    run(query)
  }, [query, run])

  // Cancel any in-flight search when the entry unmounts or the workspace moves.
  useEffect(() => {
    return () => { cancel() }
  }, [cancel, workspaceId])

  // Row labels show the workspace-relative form for a compact, scannable list;
  // result paths stay the fully qualified host identity the read and the
  // preview card use. A path outside the root, or no root, renders verbatim.
  const displayPath = (absolute: string): string =>
    workspacePath !== undefined && absolute.startsWith(workspacePath)
      ? absolute.slice(workspacePath.length).replace(/^[/\\]+/, '')
      : absolute

  const openMatch = useCallback((path: string, line: number, column: number) => {
    const kind: StudioPreview['kind'] = path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm') ? 'iframe' : 'code'
    onPreview({ path, status: 'loading', kind })
    setOpen(false)
    void readFile(path).then(({ content, language }) => {
      onPreview({
        path,
        status: 'ready',
        content,
        kind,
        focus: { line, column },
        ...(language === undefined ? {} : { language }),
      })
    }).catch(() => {
      onPreview({ path, status: 'error', kind })
    })
  }, [onPreview, readFile])

  const onKeyDownRoot = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }
  const toggle = useCallback(() => { setOpen(current => !current) }, [])

  // Portal into the studio frame node so the panel inherits the frame-scoped
  // `--studio-*` tokens that style the preview card; body is the fallback when
  // no frame marker exists (tests mount without the frame).
  const portalTarget = document.querySelector('[data-dsh-ui="studio"]') ?? document.body

  // The results list is content-stable while open; the panel keeps its scroll
  // position across re-renders because the portal node identity never changes.
  const resultsBody = (): React.ReactNode => {
    if (result !== undefined && result.matchCount === 0 && !searching) {
      return <div className={css.empty}>{t('search.noResults')}</div>
    }
    if (result === undefined || result.matchCount === 0) return null
    return (
      <ul className={css.results} aria-label={t('search.listAria')}>
        {result.files.map(file => (
          <li key={file.path} className={css.file}>
            <div className={css.fileHeader}>
              <span className={css.filePath}>{displayPath(file.path)}</span>
              <span className={css.fileCount}>{file.matches.length}</span>
            </div>
            <ul className={css.matches}>
              {file.matches.map((match, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className={css.match}
                    onClick={() => { openMatch(file.path, match.line, match.column) }}
                  >
                    <span className={css.matchPos}>{match.line}:{match.column}</span>
                    <span className={css.matchPreview}>{match.preview}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {result.truncated && <li className={css.truncated}>{t('search.truncated')}</li>}
      </ul>
    )
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDownRoot}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={t('search.trigger')}
        onClick={toggle}
      >
        <IconSearchOutline16 size={14} />
      </button>
      {open && createPortal((
        <div ref={panelRef} className={css.panel} style={position ?? MEASURE_STYLE}>
          <div className={css.panelHeader}>
            <IconSearchOutline16 size={14} />
            <input
              type="search"
              className={css.input}
              value={query}
              placeholder={t('search.input')}
              aria-label={t('search.input')}
              autoFocus
              onChange={(event) => { onChange(event.target.value) }}
              onKeyDown={onKeyDown}
            />
            {searching && <span className={css.spinner} aria-hidden="true" />}
          </div>
          {error !== undefined && <div className={css.error}>{t('search.failed', { message: error })}</div>}
          {resultsBody()}
        </div>
      ), portalTarget)}
    </div>
  )
}
