/** Owner shares for the personal studio's composable content seats. */

/** Shared section identity used by navigation and dependent panels. */
export type Section = 'project' | 'team' | 'knowledge'

/** Navigation panel share. */
export interface StudioNavigationOwnerProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
}

/** Workspace and session switcher share. */
export interface StudioWorkspaceOwnerProps {
  activeSection: Section
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

/** Center editor share retained for project mode. */
export interface StudioCenterEditorOwnerProps {
  children?: never
}

/** Center toolbar share retained for project mode. */
export interface StudioCenterToolbarOwnerProps {
  children?: never
}
