# Agent Note: the workbench completion record covers the whole task

Status: implemented

English | [中文](2026-09-16-studio-completion-whole-task-record.zh.md)

## Problem

The Lingguang workbench holds one completion record per work item, and `workbench_complete` replaces it on every call: the `studioTodoCompletions` projection folds last-wins per `todoId`, and the workspace store lets a model completion overwrite an already-completed todo ("iterative refinement across turns"). Nothing in the model-facing contract said so. The description asked only for the echoed `todoId`, the completion timing, and the verification commands actually run; `summary` was described as a "User-facing result summary"; and the write-back request framed the job as "本次执行" — this execution. A follow-up correction to the same work item therefore produced a second call whose summary described only that correction, and it silently replaced the whole-task record the first call had written. The record's lists happened to remain supersets in the observed incident, so a check on the lists alone would not have caught it: the loss was in the prose.

## Decision

The tool's own contract and write path carry the whole-task rule, because the tool description is the only instruction in the model's context for every call:

- The `workbench_complete` description states that a later call for the same `todoId` replaces the earlier record, and that the summary, implementation path, changed files, and verification must therefore cover everything the task did — every requirement and every later correction — not just the latest change. The `summary`, `implementationPath`, `changedFiles`, and `verification` parameter descriptions repeat the whole-task scope.
- `execute` reads the calling Session's own `studioTodoCompletions` projection before it appends. When that todo already carries a record, a replacement that omits any recorded `changedFiles.path` or `verification.command` throws before anything reaches the log. The refusal names the dropped entries and echoes the superseded record — its completion time and summary — so the model can merge and call again. Implementation steps are prose and are not compared.
- An accepted replacement returns `replaced: true` with the superseded record's time and summary, and its rendered result states that the record covers the whole task and asks the model to call again with the complete record when the summary or any list describes only the latest change.
- The workbench's write-back request asks for the whole record — the complete result from the start, later corrections included.

Changed-file paths and verification commands are facts about what the task did, so the monotone rule is the record's meaning rather than a heuristic: a file the task changed and then reverted still belongs to the record.

## Alternatives considered

- **Keep every superseded record and list them in the card.** Rejected for this change: it needs the `studioTodoCompletions` projection to become an append-only list (`stateVersion` bump), a client store field, and a new card region. The projection can take that shape later without touching the write path.
- **Fold the projection into one merged record** (concatenated summaries, merged lists). Rejected: the card would show a chronological patchwork instead of one readable summary, and it works against a contract that now asks the model to rewrite the whole record.
- **Validate the summary text** (length, substring, or semantic checks). Rejected: prose completeness has no mechanical test, and length is not evidence — the incremental summary in the observed incident was about as long as the record it replaced.
- **Allow one completion per work item.** Rejected: the store deliberately accepts a later model completion so a corrected task can rewrite its record; refusing the second call would freeze the first, wrong version.
- **Only reword the write-back request.** Rejected: that prompt exists only on the card's button, while the tool description travels with every call the model makes.

## Consequences

- The record is a whole-task log: a replacement keeps a file the task has since reverted and a command it has since superseded. The description states this, so a refusal is expected input rather than a surprise.
- A replacement's tool result echoes the superseded summary in full, so it is longer than the previous single-line result.
- The guard reads only the calling Session's projection. A completion another Session wrote for the same `todoId` is not compared, matching how the projection and the workbench bind a record to its authoring Session.
- No Session event payload, projection wire value, `SESSION_FORMAT_VERSION`, or client data structure changed.
- `packages/todo/tool-todo/src/index.ts` had no spec for `workbench_complete` (per-file branch coverage was 67.85%); the new spec closes that gap.

## Testing

`packages/todo/tool-todo/tests/workbench-complete.spec.ts` drives the real plugin through `ctx.tools.execute` and pins: the first call appending the trimmed whole-task completion and its rendered text, the whitespace-only `todoId` and `summary` refusals, the non-agent refusal, an accepted replacement that keeps every earlier file and command (with the projection exposing the replacement last-wins), a refusal that drops a recorded file path and appends nothing, a refusal that drops a recorded verification command, the registered schema carrying the replacement sentence, and the stable presentation call. The file reaches 100% statements, branches, functions, and lines.

`packages/client/ui-studio/tests/workbench.client.spec.tsx` pins the write-back request asking for the complete record alongside the todo's heading and id.
