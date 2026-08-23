/** Per-root transient geometry store for the four-column studio workbench. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
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
}

type StudioActions = {
  setNavigation: (draft: StudioState, px: number) => void
  setWorkspace: (draft: StudioState, px: number) => void
  setConversation: (draft: StudioState, px: number) => void
  setStatus: (draft: StudioState, px: number) => void
}

/** Create the isolated geometry store used by one root registration. */
export function createStudioStore(): EngineStoreHandle<StudioState, StudioActions> {
  return defineStore({
    init: (): StudioState => ({
      navigation: NAVIGATION_DEFAULT,
      workspace: WORKSPACE_DEFAULT,
      conversation: CONVERSATION_DEFAULT,
      status: STATUS_DEFAULT,
    }),
    actions: {
      setNavigation: (d, px: number) => { d.navigation = clampWidth(px, NAVIGATION_MIN, NAVIGATION_MAX) },
      setWorkspace: (d, px: number) => { d.workspace = clampWidth(px, WORKSPACE_MIN, WORKSPACE_MAX) },
      setConversation: (d, px: number) => { d.conversation = clampWidth(px, CONVERSATION_MIN, CONVERSATION_MAX) },
      setStatus: (d, px: number) => { d.status = clampWidth(px, STATUS_MIN, STATUS_MAX) },
    },
  })
}
