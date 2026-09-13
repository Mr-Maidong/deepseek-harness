import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
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

/** Injected editor callbacks: composer references plus the in-place file edit. */
export interface PreviewCardInjected {
  /** Insert a file-reference chip followed by the selected line range. */
  insertReference?: (ref: CodeReference) => void
  /**
   * Read the complete file and the version the edit buffer is based on.
   * @param path - the previewed file's path.
   * @returns the file's complete text and the version it was read at.
   */
  loadForEdit?: (path: string) => Promise<{ text: string; version: string }>
  /**
   * Replace the file with the edited text, refusing a version it no longer matches.
   * @param path - the previewed file's path.
   * @param text - the complete new content.
   * @param version - the version {@link PreviewCardInjected.loadForEdit} reported.
   * @returns the version the write produced, or the refusal to report.
   */
  saveEdit?: (
    path: string,
    text: string,
    version: string,
  ) => Promise<{ ok: true; version: string } | { ok: false; conflict: boolean }>
  /**
   * Re-read the file into the frame's preview store after a write.
   * @param path - the previewed file's path.
   */
  reloadPreview?: (path: string) => void
}

type Props = PropsRuntime<'studio.center.editor'> & PropsLocale<typeof NS> & PreviewCardInjected

/** Ready source file: the only preview kind the editor opens. */
type CodePreview = Extract<StudioPreview, { status: 'ready'; kind: 'code' }>

/** Inclusive 1-based line span that the insertion bubble quotes. */
interface LineSpan {
  start: number
  end: number
}

/** The open edit buffer: its text, the text it was read with, and its version. */
interface Buffer {
  text: string
  /** The text the buffer was read with, so an untouched buffer is not saved. */
  original: string
  version: string
}

/** Raised insertion bubble, keyed to the preview state it was raised on. */
interface Bubble {
  preview: StudioPreview
  anchor: { left: number; top: number }
  span: LineSpan
}

/** An edit step the card reports above the editor. */
type Failure = 'load' | 'conflict' | 'save'

/** Rendered line box of one editor row, matching the `.editor` font's line height. */
const LINE_HEIGHT_PX = 22

/**
 * Floating editor card for a selected workspace file, anchored above the
 * composer bar. Opening a source file reads it and shows a line-numbered
 * editor; Ctrl+S (or the Save control) writes the complete text back under the
 * version it was read at, and a file that changed since is refused with a
 * reload offer rather than overwritten. Selecting text or clicking a line
 * number raises an "insert reference" bubble whose inserted text quotes the
 * file path and the selected line range. Rendered artifacts (`iframe`) open
 * read-only, and the card suppresses the browser's own context menu so a
 * future card menu can own that gesture.
 */
export function PreviewCard({
  preview, onClose, t, insertReference, loadForEdit, saveEdit, reloadPreview,
}: Props): React.ReactElement | null {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLButtonElement>(null)
  const [buffer, setBuffer] = useState<Buffer | undefined>()
  const [failure, setFailure] = useState<Failure | undefined>()
  const [saving, setSaving] = useState(false)
  const [bubble, setBubble] = useState<Bubble | undefined>()
  const [reloadKey, setReloadKey] = useState(0)

  const code = preview !== undefined && preview.status === 'ready' && preview.kind === 'code'
    ? preview
    : undefined
  const path = preview?.path
  const lines = buffer === undefined ? [] : buffer.text.split('\n')
  // A search jump names the line it matched; clamp it to the open file so a
  // stale or out-of-range result still marks the nearest readable line.
  const focusLine = code?.focus === undefined || lines.length === 0
    ? undefined
    : Math.min(Math.max(1, code.focus.line), lines.length)
  // The bubble belongs to the preview state it was raised on, so a new read, a
  // different file, or a reload drops it instead of quoting stale lines.
  const live = bubble !== undefined && bubble.preview === code ? bubble : undefined
  const span = live?.span
  const dirty = buffer !== undefined && buffer.text !== buffer.original

  // One buffer belongs to one path: opening a file (or asking for a reload after
  // a refusal) reads it fresh, and a read the card has moved on from writes
  // nothing. The version read here is the guard every later save carries.
  useEffect(() => {
    setBuffer(undefined)
    setFailure(undefined)
    setBubble(undefined)
    setSaving(false)
    if (code === undefined || path === undefined) return
    // Without an edit face the card still opens the file it already read, as a
    // read-only buffer: the editor is the card's one source surface.
    if (loadForEdit === undefined) {
      setBuffer({ text: code.content, original: code.content, version: '' })
      return
    }
    let live = true
    void loadForEdit(path).then(({ text, version }) => {
      if (live) setBuffer({ text, original: text, version })
    }).catch(() => {
      if (live) setFailure('load')
    })
    return () => { live = false }
  }, [path, code !== undefined, loadForEdit, reloadKey])

  // A search jump lands the editor near the hit line. Rows are fixed-height
  // because the editor never wraps, so the offset needs no DOM measurement.
  useEffect(() => {
    const wrap = wrapRef.current
    if (focusLine === undefined || wrap === null) return
    wrap.scrollTop = Math.max(0, (focusLine - 1) * LINE_HEIGHT_PX - wrap.clientHeight / 2 + LINE_HEIGHT_PX / 2)
  }, [focusLine, buffer])

  // Dismiss the bubble when the user presses outside the editor surface.
  useEffect(() => {
    if (live === undefined) return
    const onPointerDown = (e: Event): void => {
      // A listener on the document only sees events that reached it, so the
      // target is always a node these two containers can be tested against.
      const target = e.target as Node
      // Keep the bubble open for a press inside the card's editor surface (its
      // gutter included, so the bubble can move to another line) or on the
      // bubble itself, so a handler on either can run after pointerdown.
      if (wrapRef.current?.contains(target) === true || bubbleRef.current?.contains(target) === true) return
      setBubble(undefined)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [live])

  const dismiss = (): void => { setBubble(undefined) }

  /**
   * Save the buffer under the version it was read at. The version the write
   * produced replaces the buffer's, so the next save stays guarded without a
   * re-read, and the frame re-reads the file for its stored content and label.
   */
  const save = (target: Buffer, write: NonNullable<Props['saveEdit']>): void => {
    if (saving || target.text === target.original || path === undefined) return
    const text = target.text
    setSaving(true)
    setFailure(undefined)
    void write(path, text, target.version).then((result) => {
      setSaving(false)
      if (!result.ok) {
        setFailure(result.conflict ? 'conflict' : 'save')
        return
      }
      setBuffer({ text, original: text, version: result.version })
      reloadPreview?.(path)
    }).catch(() => {
      setSaving(false)
      setFailure('save')
    })
  }

  const requestReload = (): void => { setReloadKey(key => key + 1) }

  /**
   * Raise the bubble under the last line of `next`, inside the editor's scroll
   * area, `left` being the buffer's own left edge in that area.
   */
  const raise = (target: CodePreview, next: LineSpan, left: number): void => {
    setBubble({ preview: target, anchor: { left, top: next.end * LINE_HEIGHT_PX }, span: next })
  }

  const handleEditorSelect = (
    event: ReactMouseEvent<HTMLTextAreaElement> | ReactKeyboardEvent<HTMLTextAreaElement>,
    target: CodePreview,
  ): void => {
    const next = selectionSpan(event.currentTarget)
    if (next === undefined) {
      dismiss()
      return
    }
    raise(target, next, event.currentTarget.offsetLeft)
  }

  const handleEditorKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    target: Buffer,
    write: Props['saveEdit'],
  ): void => {
    if (event.key.toLowerCase() !== 's' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (write !== undefined) save(target, write)
  }

  /**
   * Quote one line from its gutter number, which stays available while the
   * editor owns the text: a press that ends off the numbers leaves any raised
   * bubble alone.
   */
  const handleGutterLine = (event: ReactMouseEvent<HTMLElement>, target: CodePreview): void => {
    // The handler is bound to the gutter element, so its target is an element.
    const cell = (event.target as Element).closest<HTMLElement>('[data-line]')
    if (cell === null) return
    const line = Number(cell.dataset.line)
    // The gutter precedes the buffer in one row, so its far edge is the buffer's left.
    const gutter = event.currentTarget
    raise(target, { start: line, end: line }, gutter.offsetLeft + gutter.offsetWidth)
  }

  /** Quote the raised span into the composer draft; the bubble always closes. */
  const handleReference = (target: CodePreview, next: LineSpan): void => {
    insertReference?.({ path: target.path, startLine: next.start, endLine: next.end })
    dismiss()
  }

  if (preview === undefined) return null
  return <section
    className={css.preview}
    data-kind={preview.kind}
    aria-label={preview.kind === 'iframe' ? t('preview.html') : t('preview.title')}
    // The card owns its context menu; suppressing the browser's leaves the
    // gesture free for the card's own actions.
    onContextMenu={(event) => { event.preventDefault() }}
  >
    <header className={css.header}>
      <span className={css.path}>{preview.path}</span>
      {preview.kind === 'code' && <span className={css.language}>{preview.status === 'ready' ? preview.language ?? t('preview.plain') : ''}</span>}
      {code !== undefined && saveEdit !== undefined && buffer !== undefined && (
        <button
          type="button"
          className={css.action}
          onClick={() => { save(buffer, saveEdit) }}
          disabled={!dirty || saving}
          aria-label={t('preview.save')}
          title={t('preview.saveHint')}
        >{saving ? t('preview.saving') : t('preview.save')}</button>
      )}
      <button type="button" className={css.close} aria-label={t('preview.close')} title={t('preview.close')} onClick={onClose}><CloseIcon /></button>
    </header>
    {failure !== undefined && (
      <div className={css.editFailure} role="alert">
        <span>{t(failure === 'conflict' ? 'preview.editConflict' : failure === 'load' ? 'preview.editLoadFailed' : 'preview.editFailed')}</span>
        {path !== undefined && loadForEdit !== undefined && (
          <button type="button" onClick={requestReload}>{t('preview.editReload')}</button>
        )}
      </div>
    )}
    {preview.status === 'loading' && <div className={css.status}>{t('preview.loading')}</div>}
    {preview.status === 'ready' && preview.kind === 'iframe'
      // Scripts run in an opaque origin (no allow-same-origin): produced and
      // possibly untrusted HTML is embedded without access to the app origin.
      ? <iframe className={css.iframe} title={preview.path} sandbox="allow-scripts allow-forms allow-popups" srcDoc={preview.content} />
      : code !== undefined && (buffer === undefined
        ? <div className={css.status}>{t('preview.loading')}</div>
        : (
          <div ref={wrapRef} className={css.editorWrap}>
            <span className={css.gutter} aria-hidden="true" onClick={(event) => { handleGutterLine(event, code) }}>
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
            <textarea
              className={css.editor}
              value={buffer.text}
              rows={lines.length}
              wrap="off"
              spellCheck={false}
              readOnly={saveEdit === undefined}
              // The card opens as an editor, so the caret lands in the buffer
              // without a click; a card with no write face takes no focus.
              autoFocus={saveEdit !== undefined}
              aria-label={t('preview.editor')}
              onChange={(event) => { setBuffer({ ...buffer, text: event.target.value }); setFailure(undefined) }}
              onKeyDown={(event) => { handleEditorKeyDown(event, buffer, saveEdit) }}
              onMouseUp={(event) => { handleEditorSelect(event, code) }}
              onKeyUp={(event) => { handleEditorSelect(event, code) }}
            />
            {live !== undefined && span !== undefined && (
              <button
                ref={bubbleRef}
                type="button"
                className={css.reference}
                style={{ left: live.anchor.left, top: live.anchor.top }}
                aria-label={t('preview.reference')}
                title={t('preview.reference')}
                onClick={() => { handleReference(code, span) }}
              >
                {t('preview.reference')}
              </button>
            )}
          </div>
        ))}
    {preview.status === 'error' && <div className={css.status}>{t('preview.error')}</div>}
  </section>
}

/** 1-based line number containing the given character offset in `text`. */
function lineAt(text: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index++) if (text[index] === '\n') line++
  return line
}

/**
 * The lines a textarea selection covers, 1-based and inclusive. A selection that
 * ends just past a newline stops at the line that newline terminates, so
 * selecting whole lines never quotes the next one.
 */
function selectionSpan(textarea: HTMLTextAreaElement): LineSpan | undefined {
  const { selectionStart, selectionEnd, value } = textarea
  if (selectionStart === selectionEnd) return undefined
  const end = value[selectionEnd - 1] === '\n' ? selectionEnd - 1 : selectionEnd
  return { start: lineAt(value, selectionStart), end: lineAt(value, end) }
}
