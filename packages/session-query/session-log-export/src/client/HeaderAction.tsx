import type { ReactNode } from 'react'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'

/** Full props of the dialog-only header entry. */
export type SessionLogDownloadHeaderProps = SessionLogDownloadDialogProps

/**
 * Render the Session download dialog for its command-driven caller.
 *
 * The header trigger that used to sit beside this dialog is gone: the overflow
 * menu offered only download and feedback, and neither earns a permanent slot
 * in the header's utility row. `/export` still reaches
 * {@link SessionLogDownloadDialog} through the command plane, so this entry
 * renders the dialog alone and no trigger.
 * @param props - Session runtime, download controller, and localized copy.
 * @returns the Session-scoped dialog.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadHeaderProps): ReactNode {
  return <SessionLogDownloadDialog {...props} />
}
