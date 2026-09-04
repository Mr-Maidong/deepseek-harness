/**
 * Studio layout plugin, browser half: one register() call contributes
 * StudioFrame into the runtime's built-in 'root' slot, and the composition
 * disables ui-layout's own root entry, so this entry OWNS the whole-window
 * layout: it declares the frame's own child seats AND re-declares the four
 * shipped top-level seats the rest of the browser keeps registering into
 * (`sidebar`, `conversation`, `details`, `shell.overlay`) — a slot needs one
 * live declarer, and with ui-layout gone, these would be undeclared and
 * every downstream registration would throw.
 *
 * The register call also re-homes the services ui-layout used to provide:
 * `ctx.layout` (the panel-action face ui-sidebar and ui-conversation inject)
 * now maps to the studio store (toggleSidebar ↔ left rail toggle; details
 * transitions are no-ops — this layout has no details column), and the theme
 * presenter projects `ctx.theme` onto the document exactly as the shadowed
 * frame's did.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-tool-todo/client'
import { en, NS, zh } from './left-panel/locales.ts'
import { LeftPanelMain, type LeftPanelInjected } from './left-panel/LeftPanelMain.tsx'
import { PreviewCard, type PreviewCardInjected, type CodeReference } from './preview/PreviewCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'studio-left-panel': import('./left-panel/locales.ts').LeftPanelKey
  }
}
import { ThemePresenter } from './theme-presenter.ts'
import { StudioFrame } from './frame/StudioFrame.tsx'
import { StudioWorkbench } from './frame/workbench.tsx'
import { StudioLayout } from './frame/layout-service.ts'
import { createStudioStore } from './frame/stores.ts'
import { createFileTreeStore } from './left-panel/file-tree-store.ts'
import { createProjectTodoStore } from './frame/project-todo-store.ts'
import type {
  StudioCenterEditorOwnerProps, StudioCenterToolbarOwnerProps,
  StudioLeftMainOwnerProps, StudioNavigationOwnerProps, StudioStatusOwnerProps, StudioWorkspaceOwnerProps,
  StudioWorkbenchOwnerProps,
} from './frame/contract.ts'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
export { StudioLayout } from './frame/layout-service.ts'
export type {
  Section,
  StudioCenterEditorOwnerProps, StudioCenterToolbarOwnerProps,
  StudioLeftMainOwnerProps, StudioNavigationOwnerProps, StudioStatusOwnerProps, StudioWorkspaceOwnerProps,
  StudioWorkbenchOwnerProps,
} from './frame/contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Navigation registrants receive the active section and selection callback; absence renders Studio's built-in navigation. */
    'studio.navigation': { kind: 'single'; scope: 'root'; owner: StudioNavigationOwnerProps }
    /** Left-main registrants remain available for compatibility with existing compositions. */
    'studio.left.main': { kind: 'single'; scope: 'root'; owner: StudioLeftMainOwnerProps }
    /** Workspace registrants receive the active section; absence leaves the workspace column empty. */
    'studio.workspace': { kind: 'single'; scope: 'root'; owner: StudioWorkspaceOwnerProps }
    /** Status registrants receive the active section; absence leaves the status column empty. */
    'studio.status': { kind: 'single'; scope: 'root'; owner: StudioStatusOwnerProps }
    /** Workbench registrants receive the active section; absence leaves the status column empty. */
    'studio.workbench': { kind: 'single'; scope: 'session'; owner: StudioWorkbenchOwnerProps }
    /** Editor registrants present a workspace file above the conversation column. */
    'studio.center.editor': { kind: 'single'; scope: 'root'; owner: StudioCenterEditorOwnerProps }
    /** Toolbar registrants replace the empty session-scoped toolbar seat. */
    'studio.center.toolbar': { kind: 'single'; scope: 'session'; owner: StudioCenterToolbarOwnerProps }
  }
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'locale', 'sessions', 'workspaces', 'uiWorkspace']

/**
 * Client plugin body: provide ctx.layout, seat the theme presenter, and one
 * register() call — StudioFrame into 'root' with the four studio child seats
 * plus the re-declared shipped top-level seats, the geometry store, and an
 * inject hook that wires the store's left toggle into the layout service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const layout = new StudioLayout()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-studio: dictionaries')
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-studio: theme presenter')

  /* jscpd:ignore-start -- the register skeleton (provide + root + children
   * + store) is the same assembly both shell entries (ui-layout and
   * ui-studio) own; the children table, store, and inject wiring differ, but
   * the effect frame is per-fiber boilerplate. */
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRootRegistration = ctx.slots.register({
      name: 'root',
      children: {
        // Re-declared shipped top-level seats (ui-layout's entry is disabled in
        // the composition): every downstream registrant keeps a live declarer.
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        'studio.navigation': { kind: 'single', scope: 'root' },
        'studio.left.main': { kind: 'single', scope: 'root' },
        'studio.workspace': { kind: 'single', scope: 'root' },
        'studio.status': { kind: 'single', scope: 'root' },
        'studio.workbench': { kind: 'single', scope: 'session' },
        'studio.center.editor': { kind: 'single', scope: 'root' },
        'studio.center.toolbar': { kind: 'single', scope: 'session' },
      },
      // Exclusive store: the factory itself — the framework instantiates per
      // entry and delivers useStore/actions to StudioFrame as standard props.
      store: createStudioStore,
      inject: () => ({}),
      locale: NS,
    }, StudioFrame)
    const workspaceInjected = (): LeftPanelInjected => ({
      startSession: (workspaceId?: WorkspaceId) => { ctx.uiWorkspace.startSession(workspaceId) },
      open: (sessionId: SessionId) => { ctx.sessions.open(sessionId) },
      archiveSession: async (sessionId: SessionId) => { await ctx.uiWorkspace.archiveSession(sessionId) },
      renameSession: async (sessionId: SessionId, title: string) => {
        const session = ctx.sessions.binding(sessionId)?.session
        if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
        const result = await session.rename(title)
        if (!result.ok) throw new Error(result.error.message)
      },
      renameWorkspace: async (workspaceId: WorkspaceId, title: string) => { await ctx.workspaces.rename(workspaceId, title) },
      deleteWorkspace: async (workspaceId: WorkspaceId) => { await ctx.workspaces.delete(workspaceId) },
      forkSession: (sessionId: SessionId) => {
        void ctx.sessions.fork({ sessionId, increaseTitle: true }).then((childId) => { ctx.sessions.open(childId) })
      },
      createWorkspace: input => ctx.workspaces.create(input),
      listDirectory: (path, signal) => ctx.uiWorkspace.listDirectory(path, signal),
      readFile: path => ctx.uiWorkspace.readFile(path),
    })
    // Editor seat is root-scoped, so the current session is resolved at call
    // time (from the sessions list selection) rather than injected as a fixed id.
    const editorInjected = (): PreviewCardInjected => ({
      insertReference: (ref: CodeReference) => {
        const current = ctx.sessions.list.getSnapshot().current
        if (current === undefined) return
        const scoped = ctx.sessions.scope(current)
        if (scoped === undefined) return
        // conversation is not a declared injection here, so reach it through
        // the service store read (`get`) rather than the inject proxy (`ctx.<x>`).
        const conversation = ctx.get('conversation')
        if (conversation === undefined) return
        // Build the file mention (quoted form matching file-mention grammar).
        const mention = `@"${ref.path}"`
        const slash = ref.path.lastIndexOf('/')
        const name = ref.path.slice(slash + 1)
        const input = conversation.input.for(scoped)
        input.insertReferenceAtCaret(
          { source: 'reference', ref: mention, label: name, appearance: 'file', clipboardText: mention },
          `L${ref.startLine}-L${ref.endLine}`,
        )
      },
    })
    const disposeEditorRegistration = ctx.slots.register(
      { name: 'studio.center.editor', inject: editorInjected, locale: NS },
      PreviewCard,
    )
    const disposeWorkspaceRegistration = ctx.slots.register({
      name: 'studio.workspace',
      children: { 'studio.workspace.directoryFlow': { kind: 'single', scope: 'root' } },
      store: createFileTreeStore,
      inject: workspaceInjected,
      locale: NS,
    }, LeftPanelMain)
    const disposeWorkbenchRegistration = ctx.slots.register({
      name: 'studio.workbench',
      store: createProjectTodoStore,
      storeScope: 'workspace',
      inject: sessionId => ({
        sendToChat: async (message: string) => {
          const session = ctx.sessions.binding(sessionId)?.session
          if (session === undefined) throw new Error('当前会话不可用，请重新打开')
          const result = await session.prompt([{ type: 'text', text: message }], 'queue')
          if (!result.ok) throw new Error(result.error.message)
        },
      }),
      locale: NS,
    }, StudioWorkbench)
    return () => {
      disposeWorkbenchRegistration()
      disposeWorkspaceRegistration()
      disposeEditorRegistration()
      disposeRootRegistration()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-studio: service + root registration')
  /* jscpd:ignore-end */
}
