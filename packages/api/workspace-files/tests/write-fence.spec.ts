/**
 * The sandbox fence on the workspace write: a save is decided by the calling
 * Session's own workspace and mode, never by the deployment's fallback root.
 * A deployment launched outside the project (no configured root, so the process
 * cwd) must still accept a save inside the session's workspace.
 *
 * The backend is the real enforcing `SandboxedFileSystem` over the real
 * `SandboxPolicyService`, and the workspace sits outside the automatic
 * temporary write grants, so a refusal here is the fence's own and a denied
 * write leaves the file untouched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import SandboxPolicyService, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { WorkspaceFiles, type WorkspaceFileScope } from '../src/index.ts'
import { assertWorkspaceOutsideTemp, outsideTempWorkspaceParent } from '../../../../scripts/snapshot-workspace-parent.ts'
import { signal } from './harness.ts'

const SESSION = SessionId('s-fence')

let directory: string
let workspace: string
let deployment: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>
let files: WorkspaceFiles

/** The header-derived scope a direct service call receives after Typert lookup. */
function scope(sessionId: SessionId, workspaceRoot: string): WorkspaceFileScope {
  return { sessionId, workspaceRoot }
}

beforeEach(async ({ onTestFinished }) => {
  directory = await mkdtemp(join(outsideTempWorkspaceParent(), '.dsh-wsfence-'))
  onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  assertWorkspaceOutsideTemp(directory)
  workspace = join(directory, 'ws')
  deployment = join(directory, 'deployment')
  await mkdir(workspace)
  await mkdir(deployment)
  ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: deployment })
  fiber = await ctx.plugin(SandboxedFileSystem, { cwd: workspace })
  ctx.sessions.create(SESSION, { meta: { cwd: workspace } })
  files = new WorkspaceFiles(ctx, {
    maxBytes: 1024 * 1024,
    maxFileBytes: 1024 * 1024,
    maxLines: 5000,
    maxEntries: 2000,
  })
})

afterEach(async () => { await fiber?.dispose() })

describe('the workspace write fence', () => {
  it('writes inside the session workspace while the deployment root is elsewhere', async () => {
    await writeFile(join(workspace, 'note.txt'), 'before')
    await files.write(scope(SESSION, workspace), 'note.txt', { text: 'after\n' }, signal())
    expect(await readFile(join(workspace, 'note.txt'), 'utf8')).toBe('after\n')
  })

  it('refuses the write when the live session chose read-only', async () => {
    await writeFile(join(workspace, 'note.txt'), 'before')
    const session = ctx.sessions.get(SESSION)
    if (session === undefined) throw new Error('the fixture session is live')
    setSandboxMode(session, 'read-only')
    await expect(files.write(scope(SESSION, workspace), 'note.txt', { text: 'after' }, signal()))
      .rejects.toThrow('file access denied under read-only mode')
    expect(await readFile(join(workspace, 'note.txt'), 'utf8')).toBe('before')
  })

  it('fences a scope whose session is no longer live at that scope root', async () => {
    await writeFile(join(workspace, 'note.txt'), 'before')
    await files.write(scope(SessionId('s-gone'), workspace), 'note.txt', { text: 'after' }, signal())
    expect(await readFile(join(workspace, 'note.txt'), 'utf8')).toBe('after')
  })
})
