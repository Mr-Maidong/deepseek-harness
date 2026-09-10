import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { StudioPreview } from '../frame/contract.ts'
import { CloseIcon } from '../left-panel/icons/icons.tsx'
import { NS } from '../left-panel/locales.ts'
import css from './PreviewCard.module.css'

/** Structured code-selection reference passed to the composer. */
export interface CodeReference {
  readonly path: string
  readonly startLine: number
  readonly endLine: number
}

/** Injected editor callbacks: insert a code reference into the composer draft. */
export interface PreviewCardInjected {
  /** Insert a file-reference chip followed by the selected line range. */
  insertReference?: (ref: CodeReference) => void
}

type Props = PropsRuntime<'studio.center.editor'> & PropsLocale<typeof NS> & PreviewCardInjected

/** Ready source file: the only preview kind whose content is line-numbered. */
type CodePreview = Extract<StudioPreview, { status: 'ready'; kind: 'code' }>

/** Inclusive 1-based line span that the insertion bubble quotes. */
interface LineSpan {
  start: number
  end: number
}

/** Raised insertion bubble, keyed to the preview state it was raised on. */
interface Bubble {
  preview: StudioPreview
  anchor: { left: number; top: number }
  span: LineSpan
}

/**
 * Floating read-only preview card for a selected workspace file, anchored above
 * the composer bar. Source files carry a line-number gutter whose numbers mark
 * the search hit and the quoted range; selecting code or clicking a line number
 * reveals an "insert reference" bubble whose inserted text quotes the file path
 * and the selected line range.
 */
export function PreviewCard({ preview, onClose, t, insertReference }: Props): React.ReactElement | null {
  const textRef = useRef<HTMLElement>(null)
  const bubbleRef = useRef<HTMLButtonElement>(null)
  const [bubble, setBubble] = useState<Bubble | undefined>()

  const code = preview !== undefined && preview.status === 'ready' && preview.kind === 'code'
    ? preview
    : undefined
  const lines = useMemo(() => (code === undefined ? [] : code.content.split('\n')), [code])
  // A search jump names the line it matched; clamp it to the opened file so a
  // stale or out-of-range result still marks the nearest readable line.
  const focusLine = code?.focus === undefined
    ? undefined
    : Math.min(Math.max(1, code.focus.line), lines.length)
  // The bubble belongs to the preview state it was raised on, so a new read, a
  // different file, or a mode change drops it instead of quoting stale lines.
  const live = bubble !== undefined && bubble.preview === code ? bubble : undefined
  const span = live?.span

  const dismiss = (): void => {
    setBubble(undefined)
  }

  /** The scroll surface that holds the gutter and the code text. */
  const surfaceOf = (): HTMLElement | undefined => textRef.current?.parentElement ?? undefined

  // Scroll a search jump's hit line into view when its preview becomes ready.
  // The gutter row is measured against the scroll surface, so the line lands
  // near the vertical center without assuming a pixel line height.
  useEffect(() => {
    if (focusLine === undefined) return
    const surface = surfaceOf()
    if (surface === undefined) return
    const row = surface.querySelector<HTMLElement>(`[data-line="${focusLine}"]`)
    if (row === null) return
    const top = row.getBoundingClientRect().top - surface.getBoundingClientRect().top + surface.scrollTop
    surface.scrollTop = Math.max(0, top - surface.clientHeight / 2 + row.offsetHeight / 2)
  }, [code, focusLine])

  // Dismiss the bubble when the user clicks outside the code surface.
  // mouseUp/keyUp on the <pre> only fires for interactions *inside* it;
  // clicking elsewhere deselects without reaching those handlers.
  useEffect(() => {
    if (live === undefined) return
    const onPointerDown = (e: Event): void => {
      const target = e.target
      if (!(target instanceof Node)) return
      // Keep the bubble open when clicking inside the code surface (its line
      // numbers included, so the bubble can move to another line) or on the
      // bubble itself, so a handler on either can run after pointerdown.
      if (surfaceOf()?.contains(target) === true || bubbleRef.current?.contains(target) === true) return
      dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [live])

  /**
   * Raise the bubble so its lower-left corner sits under `anchor` in viewport
   * space, translated into the code wrapper that positions it. The scroll
   * surface fills that wrapper, so the surface rect is the same origin.
   */
  const raise = (surface: Element, quoted: { left: number; bottom: number }, target: CodePreview, next: LineSpan): void => {
    const box = surface.getBoundingClientRect()
    setBubble({
      preview: target,
      anchor: { left: quoted.left - box.left, top: quoted.bottom - box.top },
      span: next,
    })
  }

  const handleSelect = (event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>, target: CodePreview): void => {
    const text = textRef.current
    const range = selectedRange()
    if (text === null || range === undefined || !text.contains(range.startContainer) || !text.contains(range.endContainer)) {
      dismiss()
      return
    }
    const quoted = quoteRange(text, range)
    if (quoted === undefined) {
      dismiss()
      return
    }
    raise(event.currentTarget, { left: quoted.left, bottom: quoted.bottom }, target, quoted.span)
  }

  /**
   * Quote one line from its gutter number. The browser selection goes first, so
   * the marked number plus the bubble are the only claim on which line is
   * referenced; a press that ends off the numbers leaves any raised bubble alone.
   */
  const handleLineNumber = (event: ReactMouseEvent<HTMLElement>, target: CodePreview): void => {
    const cell = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-line]') : null
    if (cell === null) return
    window.getSelection()?.removeAllRanges()
    const box = cell.getBoundingClientRect()
    const line = Number(cell.dataset.line)
    raise(event.currentTarget, { left: box.left, bottom: box.bottom }, target, { start: line, end: line })
  }

  const handleReference = (): void => {
    if (insertReference === undefined || live === undefined || span === undefined) {
      dismiss()
      return
    }
    insertReference({ path: live.preview.path, startLine: span.start, endLine: span.end })
    dismiss()
    window.getSelection()?.removeAllRanges()
  }

  if (preview === undefined) return null
  return <section className={css.preview} data-kind={preview.kind} aria-label={preview.kind === 'iframe' ? t('preview.html') : t('preview.title')}>
    <header className={css.header}>
      <span className={css.path}>{preview.path}</span>
      {preview.kind === 'code' && <span className={css.language}>{preview.status === 'ready' ? preview.language ?? t('preview.plain') : ''}</span>}
      <button type="button" className={css.close} aria-label={t('preview.close')} title={t('preview.close')} onClick={onClose}><CloseIcon /></button>
    </header>
    {preview.status === 'loading' && <div className={css.status}>{t('preview.loading')}</div>}
    {preview.status === 'ready' && preview.kind === 'iframe'
      // Scripts run in an opaque origin (no allow-same-origin): produced and
      // possibly untrusted HTML is embedded without access to the app origin.
      ? <iframe className={css.iframe} title={preview.path} sandbox="allow-scripts allow-forms allow-popups" srcDoc={preview.content} />
      : code !== undefined && (
        <div className={css.codeWrap}>
          <pre
            className={css.code}
            onMouseUp={(event) => { handleSelect(event, code) }}
            onKeyUp={(event) => { handleSelect(event, code) }}
            onClick={(event) => { handleLineNumber(event, code) }}
            tabIndex={0}
          >
            <span className={css.gutter} aria-hidden="true">
              {lines.map((_, index) => {
                const line = index + 1
                const quoted = span !== undefined && line >= span.start && line <= span.end
                return <span
                  key={line}
                  data-line={line}
                  data-quoted={quoted || undefined}
                  data-focus={line === focusLine || undefined}
                  className={css.line}
                >{line}</span>
              })}
            </span>
            <code ref={textRef} className={css.text}>{code.content}</code>
          </pre>
          {live !== undefined && span !== undefined && (
            <button
              ref={bubbleRef}
              type="button"
              className={css.reference}
              style={{ left: live.anchor.left, top: live.anchor.top }}
              aria-label={t('preview.reference')}
              title={t('preview.reference')}
              onClick={handleReference}
            >
              {t('preview.reference')}
            </button>
          )}
        </div>
      )}
    {preview.status === 'error' && <div className={css.status}>{t('preview.error')}</div>}
  </section>
}

/** The live selection's first range, or undefined when nothing is selected. */
function selectedRange(): Range | undefined {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return undefined
  return selection.getRangeAt(0)
}

/**
 * What a range inside the code quotes: the 1-based line span and the viewport
 * bottom of its lowest visible rect. The code element holds exactly the file
 * text, so offsets measured against its start convert directly to lines.
 * Undefined covers a collapsed or off-screen range, which quotes nothing.
 */
function quoteRange(code: HTMLElement, range: Range): { span: LineSpan; left: number; bottom: number } | undefined {
  const text = range.toString()
  if (text.length === 0) return undefined
  const rects = range.getClientRects()
  const bottom = rects[rects.length - 1]
  if (bottom === undefined) return undefined
  const content = code.textContent
  const head = document.createRange()
  head.selectNodeContents(code)
  head.setEnd(range.startContainer, range.startOffset)
  const start = head.toString().length
  return {
    span: { start: lineOf(content, start), end: lineOf(content, start + text.length) },
    left: bottom.left,
    bottom: bottom.bottom,
  }
}

/** 1-based line number containing the given character offset in `content`. */
function lineOf(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length
}
