// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createStudioStore } from '../src/client/frame/stores.ts'

describe('studio layout store', () => {
  beforeEach(() => { localStorage.clear() })

  it('persists adjusted column widths and restores them on the next instance', () => {
    const store = createStudioStore().create()
    store.actions.setNavigation(155)
    store.actions.setWorkspace(320)
    store.actions.setConversation(560)
    store.actions.setStatus(520)
    const revived = createStudioStore().create()
    expect(revived.getSnapshot()).toMatchObject({
      navigation: 155,
      workspace: 320,
      conversation: 560,
      status: 520,
    })
  })

  it('persists the navigation collapse state and restores it on the next instance', () => {
    const store = createStudioStore().create()
    expect(store.getSnapshot().navigationCollapsed).toBe(false)
    store.actions.setNavigationCollapsed(true)
    const revived = createStudioStore().create()
    expect(revived.getSnapshot().navigationCollapsed).toBe(true)
  })
})
