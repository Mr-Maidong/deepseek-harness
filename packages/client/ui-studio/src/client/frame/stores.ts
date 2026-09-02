/** Per-root transient geometry and code-preview store for the four-column studio workbench. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { StudioPreview } from './contract.ts'
import {
  clampWidth, CONVERSATION_DEFAULT, CONVERSATION_MAX, CONVERSATION_MIN,
  NAVIGATION_DEFAULT, NAVIGATION_MAX, NAVIGATION_MIN, STATUS_DEFAULT, STATUS_MAX,
  STATUS_MIN, WORKSPACE_DEFAULT, WORKSPACE_MAX, WORKSPACE_MIN,
} from './columns.ts'

type StudioState = {
  navigation: number
  workspace: number
  conversation: number
  status: number
  navigationCollapsed: boolean
  preview: StudioPreview | undefined
}

type StudioActions = {
  setNavigation: (draft: StudioState, px: number) => void
  setNavigationCollapsed: (draft: StudioState, collapsed: boolean) => void
  setPreview: (draft: StudioState, preview: StudioState['preview']) => void
  setWorkspace: (draft: StudioState, px: number) => void
  setConversation: (draft: StudioState, px: number) => void
  setStatus: (draft: StudioState, px: number) => void
}

/** Create the isolated geometry store used by one root registration. */
export function createStudioStore(): EngineStoreHandle<StudioState, StudioActions> {
  return defineStore({
    persist: 'dsh.studio.layout.v1',
    init: (): StudioState => ({
      navigation: NAVIGATION_DEFAULT,
      workspace: WORKSPACE_DEFAULT,
      conversation: CONVERSATION_DEFAULT,
      status: STATUS_DEFAULT,
      navigationCollapsed: false,
      preview: undefined,
    }),
    actions: {
      setNavigation: (d, px: number) => { d.navigation = clampWidth(px, NAVIGATION_MIN, NAVIGATION_MAX) },
      setNavigationCollapsed: (d, collapsed: boolean) => { d.navigationCollapsed = collapsed },
      setPreview: (d, preview) => { d.preview = preview },
      setWorkspace: (d, px: number) => { d.workspace = clampWidth(px, WORKSPACE_MIN, WORKSPACE_MAX) },
      setConversation: (d, px: number) => { d.conversation = clampWidth(px, CONVERSATION_MIN, CONVERSATION_MAX) },
      setStatus: (d, px: number) => { d.status = clampWidth(px, STATUS_MIN, STATUS_MAX) },
    },
  })
}
