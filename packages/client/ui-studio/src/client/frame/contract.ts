/** Owner shares for the personal studio's composable content seats. */

/** Shared section identity used by navigation and dependent panels. */
export type Section = 'project' | 'team' | 'knowledge'

/** Navigation panel share. */
export interface StudioNavigationOwnerProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
}

/** How the floating card renders a ready preview: native previews (code, …) or an embedded iframe for rendered artifacts such as HTML. */
export type StudioPreviewKind = 'code' | 'iframe'

/** Extensions whose files the card embeds as rendered documents rather than shows as source. */
const RENDERED_EXTENSIONS = ['.html', '.htm']

/** Whether a path names a document the universal preview card embeds instead of editing.
 * A rendered artifact has no line grid, so it carries no language label and no focus line;
 * every other file opens as a source buffer. The file tree, the header search, and the chat
 * file opener share this one test so the same path reaches the card in the same kind from the
 * first publication, while its read is still in flight.
 * @param path - the file path as the producer authored it.
 * @returns true for rendered artifacts, false for everything else.
 */
export function isRenderedArtifact(path: string): boolean {
  const lower = path.toLowerCase()
  return RENDERED_EXTENSIONS.some(extension => lower.endsWith(extension))
}

/** The preview kind the card shows one path as.
 * @param path - the file path as the producer authored it.
 * @returns `'iframe'` for rendered artifacts, `'code'` for source files.
 */
export function previewKindFor(path: string): StudioPreviewKind {
  return isRenderedArtifact(path) ? 'iframe' : 'code'
}

/**
 * Read state of a workspace file as it travels from the tree click to the
 * floating card. A ready read discriminates on its kind: only source carries a
 * language label and a search-jump focus line, while a rendered artifact is
 * just the content the frame embeds.
 */
export type StudioPreview =
  | { path: string; status: 'loading'; kind: StudioPreviewKind }
  | {
    path: string
    status: 'ready'
    kind: 'code'
    content: string
    language?: string
    /** 1-based line/column to scroll the card to when it opens (search jump). */
    focus?: { line: number; column: number }
  }
  | { path: string; status: 'ready'; kind: 'iframe'; content: string }
  | { path: string; status: 'error'; kind: StudioPreviewKind }

/** Workspace and session switcher share. */
export interface StudioWorkspaceOwnerProps {
  activeSection: Section
  onPreview: (preview: StudioPreview) => void
  /** Path of the file currently shown in the floating preview card, or undefined. */
  openPath?: string | undefined
}

/** Project workbench share for the right rail. */
export interface StudioWorkbenchOwnerProps {
  activeSection: Section
}

/** Legacy left-main seat retained while the Studio workspace moves into the center column. */
export interface StudioLeftMainOwnerProps {
  children?: never
}

/** Real-time status panel share. */
export interface StudioStatusOwnerProps {
  activeSection: Section
}

/** Center editor share: a floating preview card over the conversation column. */
export interface StudioCenterEditorOwnerProps {
  preview?: StudioPreview | undefined
  onClose: () => void
}

/** Center toolbar share retained for project mode. */
export interface StudioCenterToolbarOwnerProps {
  children?: never
}
