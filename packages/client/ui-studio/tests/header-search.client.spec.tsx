// @vitest-environment jsdom
// The plugin entry carries the SlotMap/LocaleNamespaceMap declaration merges the
// components' props resolve against; load it type-only so the aggregate client
// tests project sees the same props as the package program.
import type {} from '../src/client/index.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { brandString } from '@deepseek-ai/dsh-brand'
import { HeaderSearch, type HeaderSearchProps } from '../src/client/header-search/HeaderSearch.tsx'
import { zh } from '../src/client/header-search/locales.ts'
import type { WorkspaceId, WorkspaceSearchResult } from '@deepseek-ai/dsh-api-workspace-controller/client'

const t = makeTranslate(zh) as never
const WS_ID = brandString<WorkspaceId>('ws-1')
// Host search results carry fully qualified paths; the fixture workspace root lets
// the spec assert the panel trims it for display but keeps it for reads.
const WS_ROOT = '/work/demo'
const SESSION_ID = 'header-search-session' as import('@deepseek-ai/dsh-session/types').SessionId

const result: WorkspaceSearchResult = {
  files: [
    {
      path: `${WS_ROOT}/src/a.ts`,
      matches: [
        { line: 1, column: 17, preview: 'const greeting = "hello"\n', matchStart: 17, matchLength: 5 },
        { line: 3, column: 5, preview: 'say hello\n', matchStart: 4, matchLength: 5 },
      ],
    },
  ],
  fileCount: 1,
  matchCount: 2,
  truncated: false,
  durationMs: 3,
}

const emptyResult: WorkspaceSearchResult = { files: [], fileCount: 0, matchCount: 0, truncated: false, durationMs: 1 }

function renderSearch(overrides: Partial<HeaderSearchProps> = {}) {
  const searchWorkspace = vi.fn(async () => result)
  const onPreview = vi.fn()
  const readFile = vi.fn(async () => ({ path: `${WS_ROOT}/src/a.ts`, content: 'const greeting = "hello"\n', language: 'typescript' }))
  const props = {
    sessionId: SESSION_ID,
    t,
    workspaceId: WS_ID as WorkspaceId | undefined,
    workspacePath: WS_ROOT as string | undefined,
    searchWorkspace,
    readFile,
    onPreview,
    ...overrides,
  } as unknown as HeaderSearchProps & ComponentProps<typeof HeaderSearch>
  const view = render(<HeaderSearch {...props} />)
  return { view, searchWorkspace, onPreview, readFile, props }
}

/** Open the floating panel and return its search input (auto-focused on mount). */
function openPanel(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: zh['search.trigger'] }))
  const input = screen.getByRole('searchbox') as HTMLInputElement
  // No studio frame marker exists in tests, so the panel falls back to body.
  expect(input.closest('[class*="_panel_"]')?.parentElement).toBe(document.body)
  return input
}

afterEach(cleanup)

describe('HeaderSearch', () => {
  it('opens the floating panel over the trigger and closes it on the second click', () => {
    renderSearch()
    const trigger = screen.getByRole('button', { name: zh['search.trigger'] })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    const input = openPanel()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    // No studio frame marker exists in tests, so the panel falls back to body.
    expect(input.closest('[class*="_panel_"]')?.parentElement).toBe(document.body)
    fireEvent.click(trigger)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('dismisses the panel on a pointer press outside of it', () => {
    renderSearch()
    openPanel()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('closes on Escape inside the panel and restores trigger focus', () => {
    renderSearch()
    const trigger = screen.getByRole('button', { name: zh['search.trigger'] })
    const input = openPanel()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('placeholder the panel body with a hint while the query is empty', () => {
    renderSearch()
    const input = openPanel()
    const hint = screen.getByText(zh['search.emptyQuery'])
    expect(hint.closest('[class*="_placeholder_"]')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'h' } })
    expect(screen.queryByText(zh['search.emptyQuery'])).toBeNull()
  })

  it('debounces the query and renders the bounded result', async () => {
    const { searchWorkspace } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    // The debounce delays the request; nothing is issued synchronously.
    expect(searchWorkspace).not.toHaveBeenCalled()
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(1) })
    expect(searchWorkspace).toHaveBeenCalledWith('ws-1', 'hello', expect.any(AbortSignal))
    expect(await screen.findByText('src/a.ts')).toBeTruthy()
    expect(screen.getByText('1:17')).toBeTruthy()
    expect(screen.getByText('3:5')).toBeTruthy()
  })

  it('issues immediately on Enter, skipping the debounce', async () => {
    const { searchWorkspace } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(1) })
    // A second Enter has no pending timer left to clear and re-issues at once.
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(2) })
  })

  it('restarts the debounce on each keystroke before the timer fires', async () => {
    const { searchWorkspace } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hel' } })
    fireEvent.change(input, { target: { value: 'hello' } })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(1) })
    expect(searchWorkspace).toHaveBeenCalledWith('ws-1', 'hello', expect.any(AbortSignal))
  })

  it('publishes an iframe preview for HTML results and omits a missing language', async () => {
    const htmlResult: WorkspaceSearchResult = {
      ...result,
      files: [{ path: `${WS_ROOT}/index.html`, matches: result.files[0]!.matches }],
    }
    const searchWorkspace = vi.fn(async () => htmlResult)
    const readFile = vi.fn(async () => ({ path: `${WS_ROOT}/index.html`, content: '<svg/>\n' }))
    const { onPreview } = renderSearch({ searchWorkspace, readFile })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const match = await screen.findByRole('button', { name: /1:17/ })
    fireEvent.click(match)
    expect(onPreview).toHaveBeenCalledWith({ path: `${WS_ROOT}/index.html`, status: 'loading', kind: 'iframe' })
    await waitFor(() => { expect(onPreview).toHaveBeenCalledTimes(2) })
    const ready = onPreview.mock.calls[1]![0] as { status: string; kind: string; language?: string }
    expect(ready).toMatchObject({ status: 'ready', kind: 'iframe' })
    expect(ready.language).toBeUndefined()
  })

  it('opens a code match whose read carries no language label', async () => {
    const readFile = vi.fn(async () => ({ path: `${WS_ROOT}/src/a.ts`, content: 'const greeting = "hello"\n' }))
    const { onPreview } = renderSearch({ readFile })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: /1:17/ }))
    await waitFor(() => {
      expect(onPreview).toHaveBeenLastCalledWith({
        path: `${WS_ROOT}/src/a.ts`,
        status: 'ready',
        content: 'const greeting = "hello"\n',
        kind: 'code',
        focus: { line: 1, column: 17 },
      })
    })
  })

  it('publishes an iframe error preview when a rendered artifact cannot be read', async () => {
    const htmlResult: WorkspaceSearchResult = {
      ...result,
      files: [{ path: `${WS_ROOT}/index.html`, matches: result.files[0]!.matches }],
    }
    const searchWorkspace = vi.fn(async () => htmlResult)
    const readFile = vi.fn(async () => { throw new Error('gone') })
    const { onPreview } = renderSearch({ searchWorkspace, readFile })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: /1:17/ }))
    await waitFor(() => {
      expect(onPreview).toHaveBeenLastCalledWith({ path: `${WS_ROOT}/index.html`, status: 'error', kind: 'iframe' })
    })
  })

  it('only the latest request commits when an earlier one settles late', async () => {
    let releaseFirst: ((value: WorkspaceSearchResult) => void) | undefined
    const searchWorkspace = vi.fn((_id: string, query: string) => {
      if (query === 'first') {
        return new Promise<WorkspaceSearchResult>((resolve) => { releaseFirst = resolve })
      }
      return Promise.resolve(emptyResult)
    })
    renderSearch({ searchWorkspace })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(1) })
    // A second query supersedes the first; the first's signal is aborted.
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(2) })
    // The first request settles late with a non-empty result; it must not win.
    releaseFirst?.(result)
    await waitFor(() => { expect(screen.queryByText('src/a.ts')).toBeNull() })
    expect(screen.getByText('没有匹配结果')).toBeTruthy()
  })

  it('clears the result when the query is emptied', async () => {
    const { searchWorkspace } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByText('src/a.ts')).toBeTruthy() })
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByText('src/a.ts')).toBeNull()
    expect(searchWorkspace).toHaveBeenCalledTimes(1)
  })

  it('opens the file in the preview card scrolled to the match and closes the panel', async () => {
    const { onPreview, readFile } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const match = await screen.findByRole('button', { name: /1:17/ })
    fireEvent.click(match)
    expect(onPreview).toHaveBeenCalledWith({ path: `${WS_ROOT}/src/a.ts`, status: 'loading', kind: 'code' })
    await waitFor(() => {
      expect(onPreview).toHaveBeenLastCalledWith({
        path: `${WS_ROOT}/src/a.ts`,
        status: 'ready',
        content: 'const greeting = "hello"\n',
        language: 'typescript',
        kind: 'code',
        focus: { line: 1, column: 17 },
      })
    })
    expect(readFile).toHaveBeenCalledWith(`${WS_ROOT}/src/a.ts`)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('publishes an error preview when the file read behind a match fails', async () => {
    const readFile = vi.fn(async () => { throw new Error('gone') })
    const { onPreview } = renderSearch({ readFile })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const match = await screen.findByRole('button', { name: /1:17/ })
    fireEvent.click(match)
    expect(onPreview).toHaveBeenCalledWith({ path: `${WS_ROOT}/src/a.ts`, status: 'loading', kind: 'code' })
    await waitFor(() => {
      expect(onPreview).toHaveBeenLastCalledWith({ path: `${WS_ROOT}/src/a.ts`, status: 'error', kind: 'code' })
    })
  })

  it('issues no request when the session is not anchored to a workspace', async () => {
    const { searchWorkspace } = renderSearch({ workspaceId: undefined, workspacePath: undefined })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).not.toHaveBeenCalled() })
    expect(input.value).toBe('hello')
  })

  it('shows the failure message when the search rejects', async () => {
    const searchWorkspace = vi.fn(async () => { throw new Error('denied') })
    renderSearch({ searchWorkspace })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('搜索失败：denied')).toBeTruthy()
  })

  it('reports a non-Error rejection through String', async () => {
    const searchWorkspace = vi.fn(async () => { throw 'denied' })
    renderSearch({ searchWorkspace })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('搜索失败：denied')).toBeTruthy()
  })

  it('drops a stale rejection when a newer request already superseded it', async () => {
    let rejectFirst: ((reason: unknown) => void) | undefined
    const searchWorkspace = vi.fn((_id: string, query: string) => {
      if (query === 'first') {
        return new Promise<WorkspaceSearchResult>((_resolve, reject) => { rejectFirst = reject })
      }
      return Promise.resolve(emptyResult)
    })
    renderSearch({ searchWorkspace })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(1) })
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledTimes(2) })
    rejectFirst?.(new Error('stale failure'))
    await waitFor(() => { expect(screen.getByText('没有匹配结果')).toBeTruthy() })
    expect(screen.queryByText(/stale failure/)).toBeNull()
  })

  it('renders the truncated notice when the result was cut short', async () => {
    const truncated: WorkspaceSearchResult = { ...result, truncated: true }
    const searchWorkspace = vi.fn(async () => truncated)
    renderSearch({ searchWorkspace })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('结果过多，已截断')).toBeTruthy()
  })

  it('keeps only in-flight state visible while a request runs, then shows the settled result', async () => {
    let release: ((value: WorkspaceSearchResult) => void) | undefined
    const searchWorkspace = vi.fn(() => new Promise<WorkspaceSearchResult>((resolve) => { release = resolve }))
    renderSearch({ searchWorkspace })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // In flight: no result rows and no empty notice yet (the spinner is
    // decorative aria-hidden chrome, asserted here through the class hook).
    await waitFor(() => { expect(document.querySelector('[class*="spinner"]')).toBeTruthy() })
    expect(screen.queryByText('没有匹配结果')).toBeNull()
    await act(async () => { release?.(emptyResult) })
    expect(screen.getByText('没有匹配结果')).toBeTruthy()
  })

  it('labels results relative to the workspace root while the read keeps the absolute path', async () => {
    const { readFile } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('src/a.ts')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /1:17/ }))
    await waitFor(() => { expect(readFile).toHaveBeenCalledWith(`${WS_ROOT}/src/a.ts`) })
  })

  it('renders a path outside the injected workspace root verbatim', async () => {
    renderSearch({ workspacePath: '/other/workspace' })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(`${WS_ROOT}/src/a.ts`)).toBeTruthy()
  })

  it('renders absolute labels when the session is anchored without a workspace root', async () => {
    renderSearch({ workspacePath: undefined })
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(`${WS_ROOT}/src/a.ts`)).toBeTruthy()
  })

  it('queries the workspace the session belongs to, resolved by the entry inject face', async () => {
    const { searchWorkspace } = renderSearch()
    const input = openPanel()
    fireEvent.change(input, { target: { value: 'hello' } })
    await waitFor(() => { expect(searchWorkspace).toHaveBeenCalledWith('ws-1', 'hello', expect.any(AbortSignal)) })
  })
})
