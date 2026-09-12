// @vitest-environment jsdom
// Studio suite overlay boot: the studio replaces ui-layout/ui-sidebar as the
// root shell, so this lane proves the replaced composition still activates
// every entry — a service cycle between the studio's provided `layout` and
// its consumers would leave fibers pending and the frame unrendered.
import { waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp } from './assembled-boot.ts'

installAssembledBootEnv()

describe('studio suite assembled boot', () => {
  it('activates the studio frame with ui-layout and ui-sidebar disabled', async () => {
    mountAssembledApp('?fixture', {
      overlays: ['packages/client/ui-studio/studio-suite.patch.yml'],
    })

    await waitFor(() => {
      expect(document.querySelector('[data-dsh-ui="studio"]')).not.toBeNull()
    }, { timeout: 20_000 })
    expect(document.body.textContent).not.toContain('Failed to load plugins')
  })
})
