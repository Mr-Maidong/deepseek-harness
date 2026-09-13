/**
 * Studio layout plugin, browser half: one register() call contributes
 * StudioFrame into the runtime's built-in 'root' slot, and the composition
 * disables ui-layout's own root entry, so this entry OWNS the whole-window
 * layout: it declares the frame's own child seats AND re-declares the shipped
 * top-level seats the rest of the browser keeps registering into (`sidebar`,
 * `main`, `shell.overlay`) — a slot needs one live declarer, and with ui-layout
 * gone a bare `register` into an undeclared seat would throw. The shipped right
 * column (`rightbar`) is deliberately left undeclared: this frame has three
 * columns plus the status column, so the panel's seat registrants wait, and the
 * panel package's expand control rides that declaration rather than leaving a
 * dead button in the conversation header.
 *
 * The register call also re-homes the services ui-layout used to provide:
 * `ctx.layout` (the panel-action face ui-sidebar and ui-conversation inject)
 * now maps to the studio store (toggleSidebar ↔ left rail toggle; panel
 * selection and right-column transitions are no-ops — this layout has neither),
 * and the theme presenter projects `ctx.theme` onto the document exactly as the
 * shadowed frame's did.
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
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import { en as headerEn, NS as HEADER_NS, zh as headerZh } from './header-search/locales.ts'
import { HeaderSearch, type HeaderSearchInjected } from './header-search/HeaderSearch.tsx'
import { en, NS, zh } from './left-panel/locales.ts'
import { LeftPanelMain, type LeftPanelInjected } from './left-panel/LeftPanelMain.tsx'
import { createPreviewEditFace } from './preview/edit-face.ts'
import { PreviewCard, type PreviewCardInjected, type CodeReference } from './preview/PreviewCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'studio-left-panel': import('./left-panel/locales.ts').LeftPanelKey
    'studio-header-search': import('./header-search/locales.ts').HeaderSearchKey
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
  StudioWorkbenchOwnerProps, StudioPreview,
} from './frame/contract.ts'

/** Baked actions of the frame's exclusive studio store, as delivered to the root entry's inject hook. */
type StudioFrameActions = BoundActions<ReturnType<typeof createStudioStore>>

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

/**
 * Required services (cordis fiber inject — the loader passes all module exports as an object plugin).
 * `uiWorkspace` is deliberately absent: ui-workspace injects `layout`, which this plugin provides,
 * so gating activation on uiWorkspace would deadlock the composition. The UI-time callbacks below
 * resolve it through `ctx.get` instead.
 */
export const inject = ['slots', 'theme', 'locale', 'sessions', 'workspaces', 'remote', 'remote.workspace', 'remote.workspaceFiles']

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
  ctx.effect(() => ctx.locale.register(HEADER_NS, { zh: headerZh, en: headerEn }), 'ui-studio: header-search dictionaries')
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
    // Root-scoped bridge into the frame's preview store: the root entry's
    // inject hook receives the baked studio-store actions (this registration
    // owns the store), and the Session-scoped header entry publishes preview
    // states through it — a Session-scoped registrant cannot declare a
    // root-scoped store, and sharing the store handle across scopes throws.
    // The root entry mounts before any Session header entry exists, so the
    // hook is guaranteed live before a consumer reads it; `requireBridge`
    // fails loud anyway if that ever stops holding.
    let previewPublisher: ((preview: StudioPreview) => void) | undefined
    const bridge = {
      attach(actions: StudioFrameActions): void {
        previewPublisher = (preview) => { actions.setPreview(preview) }
      },
      require(): (preview: StudioPreview) => void {
        if (previewPublisher === undefined) {
          throw new Error('ui-studio: header-search preview bridge not wired (root entry not mounted)')
        }
        return previewPublisher
      },
    }
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRootRegistration = ctx.slots.register({
      name: 'root',
      children: {
        // Re-declared shipped top-level seats (ui-layout's entry is disabled in
        // the composition): every downstream registrant keeps a live declarer.
        // `rightbar` is absent on purpose — the frame has no right column, so
        // its panel seat and the header control that opens it stay unregistered.
        'sidebar': { kind: 'single', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
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
      inject: (actions) => { bridge.attach(actions); return {} },
      locale: NS,
    }, StudioFrame)
    // Search + file-read face shared by the left-panel entry (full member)
    // and the Session-header search entry (subset via the same closures).
    // uiWorkspace is resolved per call rather than injected — see the inject
    // list contract; every caller is a post-activation UI gesture.
    const uiWorkspace = () => {
      const service = ctx.get('uiWorkspace')
      if (service === undefined) {
        throw new Error('ui-studio: uiWorkspace service is not composed')
      }
      return service
    }
    const studioSearchFace = {
      readFile: (path: string) => uiWorkspace().readFile(path),
      searchWorkspace: async (workspaceId: WorkspaceId, query: string, signal?: AbortSignal) => {
        const result = await ctx.remote.workspace.search({ workspaceId, query }, signal)
        if (!result.ok) throw new Error(result.error.message)
        return result.value.result
      },
    }
    const workspaceInjected = (): LeftPanelInjected => ({
      startSession: (workspaceId?: WorkspaceId) => { uiWorkspace().startSession(workspaceId) },
      open: (sessionId: SessionId) => { ctx.sessions.open(sessionId) },
      archiveSession: async (sessionId: SessionId) => { await uiWorkspace().archiveSession(sessionId) },
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
      listDirectory: (path, signal) => uiWorkspace().listDirectory(path, signal),
      ...studioSearchFace,
      gitSummary: async (workspaceId, signal) => {
        const result = await ctx.remote.workspace.gitSummary({ workspaceId }, signal)
        if (!result.ok) throw new Error(result.error.message)
        return result.value.summary
      },
    })
    // Editor seat is root-scoped, so the current session is resolved at call
    // time (from the sessions list selection) rather than injected as a fixed id.
    const currentSession = (): SessionId => {
      const current = ctx.sessions.list.getSnapshot().current
      if (current === undefined) throw new Error('ui-studio: no current session owns this file')
      return current
    }
    // The edit buffer reads the complete file through `workspaceFiles`, the only
    // face that also reports the version a save is guarded by; a saved file is
    // re-read through the ordinary preview read so the store keeps one source of
    // truth for the card's content and language label.
    const previewEdit = createPreviewEditFace({
      workspaceFiles: ctx.remote.workspaceFiles,
      session: currentSession,
      publish: (preview) => { bridge.require()(preview) },
      readFile: path => studioSearchFace.readFile(path),
    })
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
      ...previewEdit,
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
    // The Session header's search utility: session-scope inject receives the
    // fixed current sessionId; the workspace it belongs to — id and root path
    // together — is resolved from the workspaces snapshot at registration
    // time, and preview states are published through the root-entry bridge
    // (the store itself stays exclusive to its declaring scope). Registered
    // last so the trigger sits rightmost in the utilities row.
    const disposeHeaderSearchRegistration = ctx.slots.inject(
      'conversation.session.header.utilities',
      () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'studio-header-search',
        order: Number.MAX_SAFE_INTEGER,
        locale: HEADER_NS,
        inject: (sessionId): HeaderSearchInjected => {
          // One lookup so the id and the root path cannot disagree: results
          // carry fully qualified host paths, and the panel displays them
          // relative to this same workspace root.
          const workspace = ctx.workspaces.list.getSnapshot().items.find(
            candidate => candidate.sessionIds.includes(sessionId),
          )
          return {
            workspaceId: workspace?.workspaceId,
            workspacePath: workspace?.path,
            ...studioSearchFace,
            onPreview: (preview) => { bridge.require()(preview) },
          }
        },
      }, HeaderSearch),
    )
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
      disposeHeaderSearchRegistration()
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
