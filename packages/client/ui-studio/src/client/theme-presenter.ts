/** Applies the active client theme to the document and retracts only owned DOM state. */
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Body attribute selecting the dark palette. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/** Projects theme snapshots onto document-level browser styling. */
export class ThemePresenter {
  private appliedTokens: string[] = []
  private readonly themeColorMeta: HTMLMetaElement

  /** Create the presenter-owned theme-color metadata node. */
  constructor() {
    this.themeColorMeta = document.createElement('meta')
    this.themeColorMeta.name = 'theme-color'
  }

  /** Apply the resolved theme snapshot. @param snapshot - Theme to project. */
  apply(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor
    if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta)
  }

  /** Remove the document state owned by this presenter. */
  dispose(): void {
    document.documentElement.style.removeProperty('color-scheme')
    document.body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) document.body.style.removeProperty(name)
    this.appliedTokens = []
    this.themeColorMeta.remove()
  }
}
