# Agent Note: the workbench card lookup needs no CSS.escape

Status: implemented

English | [中文](2026-09-15-studio-workbench-card-lookup-without-css-escape.zh.md)

## Problem

Expanding a todo card schedules a 220 ms timer that scrolls the card into view. The timer looked its target up as `article[data-todoid="${CSS.escape(todoId)}"]`, and `CSS.escape` does not exist in jsdom, which omits the `CSS` namespace entirely. The timer also outlives the test that scheduled it: by the time it fires the spec's document is torn down, so the throw happened after the test had already been reported, landing as an unhandled error rather than a failure. Every test passed while `test:gui` still exited 1, which is a worse signal than a failing assertion because nothing in the report pointed at the cause.

## Decision

The lookup compares the dataset value instead of interpolating the id into an attribute selector: `[...document.querySelectorAll<HTMLElement>('article[data-todoid]')].find(element => element.dataset.todoid === todoId)`. A todo id needs no escaping to be compared as data, so the deferred code no longer depends on a browser API that the test environment lacks.

## Alternatives considered

- **Shim `CSS.escape` in the spec.** Rejected: no other jsdom gap in this repository is patched that way, and a global shim hides the fact that the deferred path cannot run under jsdom at all.
- **Keep the selector and clear the timer on unmount.** Rejected as the fix for this defect, though it addresses the timer outliving its component: it needs an effect and a ref to cancel one timer whose post-teardown run is now a harmless no-op, and it leaves the jsdom gap in place for the next deferred lookup.
- **Interpolate the id without escaping.** Rejected: ids reach the selector as data, and unescaped interpolation into a selector is exactly the hazard `CSS.escape` exists to prevent.

## Consequences

- `test:gui` exits 0 with no unhandled errors; the suite no longer reports a failure that its test results contradict.
- The scroll path itself stays untested in this lane: the timer outlives the spec's document, so the callback finds no card and returns before the geometry. Covering it needs fake timers and stubbed rects, which is deferred work rather than a reason to keep the crash.