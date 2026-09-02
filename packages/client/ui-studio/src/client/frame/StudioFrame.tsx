/** Four-column personal workbench frame with wuxia-inspired visual treatment. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, RefObject } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { computeColumns } from './columns.ts'
import type { createStudioStore } from './stores.ts'
import { Navigation } from '../navigation/Navigation.tsx'
import type { Section } from './contract.ts'
import { NS } from '../left-panel/locales.ts'
import css from './StudioFrame.module.css'

function useFrameWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(() => typeof window === 'undefined' ? 0 : window.innerWidth)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    let frame: number | null = null
    const update = () => {
      frame = null
      const next = element.getBoundingClientRect().width
      if (next > 0) setWidth(next)
    }
    const observer = new ResizeObserver(() => {
      if (frame === null) frame = requestAnimationFrame(update)
    })
    observer.observe(element)
    update()
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [ref])
  return width
}

function DragHandle(props: { side: string; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])
  const onDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = latest.current = event.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  return <div
    className={css.handle}
    style={{ left: props.left }}
    data-side={props.side}
    data-dragging={dragging || undefined}
    onPointerDown={onDown}
    onPointerMove={onMove}
    onPointerUp={onUp}
  />
}

/** Full composed props for the workbench frame. */
export type StudioFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar.settings' | 'studio.navigation' | 'studio.workspace' | 'studio.workbench' | 'conversation' | 'studio.status' | 'studio.center.editor' | 'studio.center.toolbar' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createStudioStore>>
  & PropsLocale<typeof NS>

/** Render the four-column personal workbench. */
export function StudioFrame({ useStore, actions, renderSlot, SessionProvider }: StudioFrameProps) {
  const panels = useStore(s => s)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const viewport = useFrameWidth(frameRef)
  const [activeSection, setActiveSection] = useState<Section>('project')
  const [settingsOpenRequest, setSettingsOpenRequest] = useState(0)
  const dragBase = useRef({ navigation: 0, workspace: 0, conversation: 0, status: 0 })
  const [dragging, setDragging] = useState(false)
  const conversationViewRef = useRef<HTMLDivElement | null>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  // Anchor the floating code-preview card above the resident composer bar: the
  // bar's height is dynamic (draft growth, dock cards), so measure the seat.
  useEffect(() => {
    const view = conversationViewRef.current
    if (view === null) return
    const seat = view.querySelector('[data-composer-seat]')
    if (seat === null) return
    const update = () => { setComposerHeight(seat.getBoundingClientRect().height) }
    const observer = new ResizeObserver(update)
    observer.observe(seat)
    update()
    return () => { observer.disconnect() }
  }, [])
  const start = useCallback((panel: keyof typeof dragBase.current) => {
    dragBase.current[panel] = panels[panel]
    setDragging(true)
  }, [panels])
  const end = useCallback(() => { setDragging(false) }, [])
  const drag = useCallback((panel: keyof typeof dragBase.current, dx: number) => {
    const setters = {
      navigation: actions.setNavigation,
      workspace: actions.setWorkspace,
      conversation: actions.setConversation,
      status: actions.setStatus,
    }
    setters[panel](dragBase.current[panel] + dx)
  }, [actions])
  const cols = computeColumns(viewport, panels.navigation, panels.workspace, panels.conversation, panels.status)
  const navigationWidth = panels.navigationCollapsed ? 48 : cols.navigation
  const shared = { activeSection, onSectionChange: setActiveSection }

  return <div
    ref={frameRef}
    className={css.frame}
    style={{ gridTemplateColumns: `${navigationWidth}px ${cols.workspace}px minmax(0, 1fr) ${cols.status}px` }}
    data-dragging={dragging || undefined}
    data-navigation-collapsed={panels.navigationCollapsed || undefined}
    data-section={activeSection}
  >
    <aside className={css.navigationCol}>
      {renderSlot('studio.navigation', shared, {
        fallback: <Navigation
          active={activeSection}
          collapsed={panels.navigationCollapsed}
          onChange={setActiveSection}
          onSettings={() => { setSettingsOpenRequest(request => request + 1) }}
          onCollapse={() => { actions.setNavigationCollapsed(!panels.navigationCollapsed) }}
        />,
      })}
      {renderSlot('sidebar.settings', {
        wide: !panels.navigationCollapsed,
        openRequest: settingsOpenRequest,
        triggerHidden: true,
      })}
    </aside>
    <aside className={css.workspaceCol}>
      {renderSlot('studio.workspace', {
        activeSection,
        onPreview: (preview) => { actions.setPreview(preview) },
        openPath: panels.preview?.path,
      })}
    </aside>
    <main className={css.conversationCol} style={{ '--studio-composer-height': `${composerHeight}px` } as CSSProperties}>
      <div ref={conversationViewRef} className={css.conversationView}>
        {renderSlot('conversation', {})}
      </div>
      {panels.preview !== undefined && renderSlot('studio.center.editor', {
        preview: panels.preview,
        onClose: () => { actions.setPreview(undefined) },
      })}
    </main>
    <aside className={css.statusCol}><SessionProvider>{renderSlot('studio.workbench', { activeSection })}</SessionProvider></aside>
    <div className={css.overlayLayer} data-shell-overlay>{renderSlot('shell.overlay', {})}</div>
    <DragHandle side="workspace" left={navigationWidth + cols.workspace} onStart={() => { start('workspace') }} onDrag={(dx) => { drag('workspace', dx) }} onEnd={end} />
    <DragHandle side="conversation" left={viewport - cols.status} onStart={() => { start('status') }} onDrag={(dx) => { drag('status', -dx) }} onEnd={end} />
  </div>
}
