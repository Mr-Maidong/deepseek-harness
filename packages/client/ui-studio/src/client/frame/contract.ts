/** Owner shares for the personal studio's composable content seats. */

/** Shared section identity used by navigation and dependent panels. */
export type Section = 'project' | 'team' | 'knowledge'

/** Navigation panel share. */
export interface StudioNavigationOwnerProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
}

/** Read state of a workspace file as it travels from the tree click to the floating card. */
export type StudioPreview =
  | { path: string; status: 'loading' }
  | { path: string; status: 'ready'; content: string; language?: string }
  | { path: string; status: 'error' }

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

/** Center editor share: a floating code-preview card over the conversation column. */
export interface StudioCenterEditorOwnerProps {
  preview?: StudioPreview | undefined
  onClose: () => void
}

/** Center toolbar share retained for project mode. */
export interface StudioCenterToolbarOwnerProps {
  children?: never
}
