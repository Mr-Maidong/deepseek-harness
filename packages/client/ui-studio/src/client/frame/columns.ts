/** Pure four-column solver for the personal studio workbench. */

/** Resolved widths for the navigation, workspace, conversation, and status columns. */
export interface StudioColumns {
  navigation: number
  workspace: number
  conversation: number
  status: number
}

/** Minimum usable width of the workspace column. */
export const WORKSPACE_MIN = 240
/** Minimum usable width of the conversation column. */
export const CONVERSATION_MIN = 320
/** Fixed navigation-panel width. */
export const NAVIGATION_MIN = 150
/** Maximum navigation-panel width, equal to its fixed width. */
export const NAVIGATION_MAX = 160
/** Initial navigation-panel width. */
export const NAVIGATION_DEFAULT = 150
/** Draggable workspace-panel range. */
export const WORKSPACE_MAX = 360
/** Initial workspace-panel width. */
export const WORKSPACE_DEFAULT = 280
/** Draggable conversation-panel range. */
export const CONVERSATION_MAX = 640
/** Initial conversation-panel width. */
export const CONVERSATION_DEFAULT = 480
/** Draggable real-time status-panel range. */
export const STATUS_MIN = 360
/** Maximum status-panel width. */
export const STATUS_MAX = 640
/** Initial status-panel width. */
export const STATUS_DEFAULT = 460

/** Clamp a requested panel width to its declared range.
 * @param px - Requested width in pixels.
 * @param min - Minimum accepted width.
 * @param max - Maximum accepted width.
 * @returns The rounded width within the declared range.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * @param viewport - Available frame width in pixels.
 * @param navigation - Navigation preference in pixels.
 * @param workspace - Workspace preference in pixels.
 * @param conversation - Conversation preference in pixels.
 * @param status - Status preference in pixels.
 * @returns Resolved column widths.
 */
export function computeColumns(
  viewport: number,
  navigation: number,
  workspace: number,
  conversation: number,
  status: number,
): StudioColumns {
  const n = clampWidth(navigation, NAVIGATION_MIN, NAVIGATION_MAX)
  let w = clampWidth(workspace, WORKSPACE_MIN, WORKSPACE_MAX)
  let c = clampWidth(conversation, CONVERSATION_MIN, CONVERSATION_MAX)
  let s = clampWidth(status, STATUS_MIN, STATUS_MAX)
  const available = Math.max(0, viewport - n)

  if (w + c + s <= available) return { navigation: n, workspace: w, conversation: c, status: s }

  s = Math.max(STATUS_MIN, available - w - c)
  if (w + c + s <= available) return { navigation: n, workspace: w, conversation: c, status: s }

  c = Math.max(CONVERSATION_MIN, available - w - STATUS_MIN)
  s = Math.max(STATUS_MIN, available - w - c)
  if (w + c + s <= available) return { navigation: n, workspace: w, conversation: c, status: s }

  w = Math.max(0, available - CONVERSATION_MIN - STATUS_MIN)
  c = Math.max(0, available - w - STATUS_MIN)
  s = Math.max(0, available - w - c)
  return { navigation: n, workspace: w, conversation: c, status: s }
}
