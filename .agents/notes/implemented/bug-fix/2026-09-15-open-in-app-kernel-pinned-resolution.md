# Agent Note: open-in-app resolution pins the kernel it reasons about

Status: implemented

English | [中文](2026-09-15-open-in-app-kernel-pinned-resolution.zh.md)

## Problem

`canOpenNativePath` treats Linux as desktop-capable when it sees `DISPLAY`, `WAYLAND_DISPLAY`, or a WSL kernel, and the open-in-app resolver gates its `requiresDesktop` locators — the Linux file manager (`xdg-open`) — on that answer. WSL is the reason the kernel matters: it carries a Windows desktop even with no X or Wayland session.

The resolver called `canOpenNativePath` with only `platform` and `env`, so the kernel always came from `os.release()` of the machine running the code. `OpenInAppInternals` had no field for it. A spec could therefore pin every other fact and still get a different answer on a WSL host than on desktop Linux: `resolver.spec.ts`'s "does not offer the Linux file manager without a desktop session" expected `null` for an environment with no display variables, and on WSL the resolver instead offered `xdg-open`. The sibling `native-command` package already threads `osRelease` through its own path-opener specs, so the omission was local to this seam.

## Decision

`OpenInAppInternals` and `ResolvedInternals` carry `osRelease`, defaulted once in `resolveInternals` to `os.release()` beside the existing `platform` default, and both native-path call sites forward it — the `requiresDesktop` gate and the `shell-open` launch. The resolver now decides WSL from the fact it was handed rather than from the host it happens to run on.

`resolver.spec.ts` pins `osRelease: '6.8.0-generic'` in its shared `bare()` baseline, so every case reasons about desktop Linux regardless of the runner's kernel. `icons.spec.ts` needs no pin: it builds launch literals and never reaches the resolver.

## Alternatives considered

- **Pin the kernel only in the one failing case.** Rejected: the leak is a property of the seam, not of one assertion, and any later case that resolves a `requiresDesktop` locator would inherit the same host dependency.
- **Detect WSL from env markers alone (`WSL_DISTRO_NAME`, `WSL_INTEROP`) and drop the kernel test.** Rejected: those variables are absent in some WSL contexts, and `canOpenNativePath`'s kernel check is the authority the `native-command` package already relies on.
- **Set `WSL_DISTRO_NAME` to an empty string in the spec to defeat the marker check.** Rejected: it does not defeat the kernel check, and it makes the spec assert a fact about env plumbing instead of the desktop-session rule being tested.

## Consequences

- The failing case passes on this WSL host and keeps passing on desktop Linux; the suite no longer varies with the kernel of whoever runs it.
- Production behavior is unchanged: `resolveInternals` defaults the new field to the same `os.release()` value the callee read for itself, and the `shell-open` launch now receives it explicitly.
- A resolver test can now express WSL (`osRelease: '6.8.0-...-microsoft-standard-WSL2'`) as data, which the previous interface could not.