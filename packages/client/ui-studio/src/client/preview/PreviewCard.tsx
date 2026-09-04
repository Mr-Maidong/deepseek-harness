import { useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
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

/**
 * Floating read-only preview card for a selected workspace file, anchored above
 * the composer bar. Selecting code reveals an "insert reference" bubble whose
 * inserted text quotes the file path and the selected line range.
 */
export function PreviewCard({ preview, onClose, t, insertReference }: Props): React.ReactElement | null {
  // Selection bubble anchor: {left, top} in card coordinates for the bottom of
  // the last selected line (the cursor's resting line), or undefined hiding it.
  const [anchor, setAnchor] = useState<{ left: number; top: number } | undefined>()
  const [range, setRange] = useState<{ start: number; end: number } | undefined>()
  const codeRef = useRef<HTMLPreElement>(null)

  const dismiss = (): void => {
    setAnchor(undefined)
    setRange(undefined)
  }

  const handleSelect = (): void => {
    if (preview === undefined || preview.kind !== 'code' || preview.status !== 'ready') {
      dismiss()
      return
    }
    const selection = window.getSelection()
    const code = codeRef.current
    if (selection === null || code === null || selection.isCollapsed || selection.rangeCount === 0
      || !code.contains(selection.anchorNode) || !code.contains(selection.focusNode)) {
      dismiss()
      return
    }
    const rects = selection.getRangeAt(0).getClientRects()
    // A collapsed/void range yields no rects; only offer insertion over a visible selection.
    if (rects.length === 0) {
      dismiss()
      return
    }
    // Anchor the bubble just below the last selected line (rects are ordered
    // top-to-bottom, so the final rect is the cursor's resting line).
    const last = rects[rects.length - 1]
    if (last === undefined) {
      dismiss()
      return
    }
    // The bubble's positioned parent is .codeWrap (position: relative), so
    // compute the anchor against that rect, not the outer .preview card rect
    // (which includes the header and would offset the bubble downward).
    const wrap = code.closest(`.${css.codeWrap}`)
    if (!(wrap instanceof HTMLElement)) {
      dismiss()
      return
    }
    const box = wrap.getBoundingClientRect()
    const rangeOfSelection = lineRange(code)
    if (rangeOfSelection === undefined) {
      dismiss()
      return
    }
    setRange(rangeOfSelection)
    setAnchor({ left: last.left - box.left, top: last.bottom - box.top })
  }

  const handleReference = (): void => {
    if (insertReference === undefined || range === undefined || preview === undefined || preview.status !== 'ready') {
      dismiss()
      return
    }
    insertReference({ path: preview.path, startLine: range.start, endLine: range.end })
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
    {preview.status === 'loading' && <div className={css.code}>{t('preview.loading')}</div>}
    {preview.status === 'ready' && preview.kind === 'iframe'
      // Scripts run in an opaque origin (no allow-same-origin): produced and
      // possibly untrusted HTML is embedded without access to the app origin.
      ? <iframe className={css.iframe} title={preview.path} sandbox="allow-scripts allow-forms allow-popups" srcDoc={preview.content} />
      : preview.status === 'ready' && (
        <div className={css.codeWrap}>
          <pre ref={codeRef} className={css.code} onMouseUp={handleSelect} onKeyUp={handleSelect} tabIndex={0}>
            <code>{preview.content}</code>
          </pre>
          {anchor !== undefined && range !== undefined && (
            <button
              type="button"
              className={css.reference}
              style={{ left: anchor.left, top: anchor.top }}
              aria-label={t('preview.reference')}
              title={t('preview.reference')}
              onClick={handleReference}
            >
              {t('preview.reference')}
            </button>
          )}
        </div>
      )}
    {preview.status === 'error' && <div className={css.code}>{t('preview.error')}</div>}
  </section>
}

/** Line span of the current selection inside the code content, or undefined when empty. */
function lineRange(code: HTMLPreElement): { start: number; end: number } | undefined {
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0
    || !code.contains(selection.anchorNode) || !code.contains(selection.focusNode)) return undefined
  const content = code.textContent
  const range = selection.getRangeAt(0)
  // Measure character offsets of the range against the content start (the code
  // element holds exactly the file text), then convert to 1-based lines.
  const head = document.createRange()
  head.selectNodeContents(code)
  head.setEnd(range.startContainer, range.startOffset)
  const startOffset = head.toString().length
  const endOffset = startOffset + range.toString().length
  if (endOffset <= startOffset) return undefined
  return {
    start: lineOf(content, startOffset),
    end: lineOf(content, endOffset),
  }
}

/** 1-based line number containing the given character offset in `content`. */
function lineOf(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length
}
