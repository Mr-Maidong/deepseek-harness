import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CloseIcon } from '../left-panel/icons/icons.tsx'
import { NS } from '../left-panel/locales.ts'
import css from './CodePreview.module.css'
/** Floating read-only preview card for a selected workspace file, anchored above the composer bar. */
export function CodePreview({ preview, onClose, t }: PropsRuntime<'studio.center.editor'> & PropsLocale<typeof NS>): React.ReactElement | null {
  if (preview === undefined) return null
  return <section className={css.preview} aria-label={t('preview.title')}>
    <header className={css.header}>
      <span className={css.path}>{preview.path}</span>
      <span className={css.language}>{preview.status === 'ready' ? preview.language ?? t('preview.plain') : ''}</span>
      <button type="button" className={css.close} aria-label={t('preview.close')} title={t('preview.close')} onClick={onClose}><CloseIcon /></button>
    </header>
    {preview.status === 'loading' && <div className={css.code}>{t('preview.loading')}</div>}
    {preview.status === 'ready' && <pre className={css.code}><code>{preview.content}</code></pre>}
    {preview.status === 'error' && <div className={css.code}>{t('preview.error')}</div>}
  </section>
}
