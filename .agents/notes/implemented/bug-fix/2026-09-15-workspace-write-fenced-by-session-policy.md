# Agent Note: the workspace write is fenced by the calling Session's policy

Status: implemented

English | [中文](2026-09-15-workspace-write-fenced-by-session-policy.zh.md)

## Problem

`WorkspaceFiles.write` published through `ctx.fs.writeText` without the per-call sandbox policy, so the enforcing filesystem fell back to the deployment policy, whose `workspace-write` root is the configured root or the process cwd. On a desktop app launched outside the project — the ordinary case for a packaged build — that root does not contain the Session's workspace, and every preview-card save was refused with `file access denied under workspace-write mode`, naming a file inside the workspace the Session itself owns.

## Decision

`write` resolves the policy for the Session on the wire and hands it to `writeText` as the per-call policy. The live Session supplies the mode it last chose, and the root this call already resolved for containment supplies the boundary, so the fence covers exactly the workspace the operation is confined to. A scope whose Session is no longer live keeps the deployment mode with that scope root, because the same header-derived root is what the read path already uses.

## Alternatives considered

- **Require the deployment root to match the Session workspace.** Rejected: a deployment may configure no root at all, and a packaged app's process cwd is not the project.
- **Skip the fence for this endpoint and trust `confine`.** Rejected: `confine` compares the path lexically against the scope root, while the filesystem fence re-canonicalizes immediately before the mutation and narrows the window in which an ancestor symlink swap could redirect the write.
- **Keep the deployment mode and correct only the root.** Rejected: the Session's `sandbox/mode` override is the policy the user chose for that Session, and the deployment default would silently outrank it for this one mutation.
- **Read the Session through `ctx.get('sessions')` to tolerate a missing store.** Rejected: `sessions` is a declared injection of this service, so a fixture that exercises the write must supply one.

## Consequences

- The fence boundary follows the Session rather than the deployment: a save inside the Session workspace succeeds under a deployment root elsewhere, and a Session switched to `read-only` refuses it.
- A fence refusal is not a `workspace-file/*` code; it crosses the Gateway as `gateway/internal` with the path and mode in its message, which the package README records.
- `tests/harness.ts` provides a `sessions` stand-in, because that fixture constructs the service directly and its declared inject never resolves. `tests/write-fence.spec.ts` boots the real `SandboxedFileSystem` and `SandboxPolicyService` over a workspace outside the temporary write grants, so a refusal there is the fence's own.
