# Agent Note: directory picker native 后端补足 listing 与预览读取

Status: implemented

[English](2026-09-07-directory-picker-native-read-members.md) | 中文

## Problem

在 macOS 上,自适应组合对有人值守的回环主机会解析到 native directory picker,于是 studio 文件树的 `directoryPicker/list` 与 `directoryPicker/readText` 线路被以 `directory-picker/unavailable` 拒绝:controller 只认 browse kind,而 native capability 只有 `pick`。

## Decision

沿 seam 判别联合的可合并扩展方向扩展,而不是按 kind 名分支:

- native capability(`{ kind: 'native', pick(signal) }`)在 `pick` 之外增加可选的只读 `list` 与 `readText` 成员;子目录创建仍然仅限 browse。
- `DirectoryPickerController` 按解析出的 kind 上实际存在的成员来提供每个生成的 Remote verb,绝不只看 kind 名——联合是合并可扩展的,未来的 kind 可能携带本 controller 不认识的成员。某个 kind 没有 verb 对应的成员时,以 `directory-picker/unavailable` 应答,details 携带 kind。
- native `readText` 将预览限定为 1 MiB 以下的常规非 symlink 文件,与 browse 的契约一致,但不含 browse 的 realpath 包含性检查:该检查会拒绝位于 symlink 祖先之后的所有路径(macOS 临时目录),在同一平台上重新引入相同的不可读问题。
- native `list` 遇到损坏的 symlink 不再让整层失败;probe 将该行保留为文件。

## Alternatives considered

- **在 controller 里按 kind 名分派。** 拒绝:联合是合并可扩展的,按 kind 名的 switch 会静默拒绝未来 kind 已经提供的成员;按 kind 上实际存在的成员提供每个 verb,才能让 controller 对新 kind 保持开放。
- **在 native `readText` 中复用 browse 的 realpath 包含性检查。** 拒绝:该检查会拒绝位于 symlink 祖先之后的所有路径(macOS 临时目录),重新引入本次变更要消除的同一不可读问题。

## Consequences

- 线路暴露生成的 `directoryPicker/list`、`directoryPicker/readText`、`directoryPicker/createDirectory` 方法,错误码为 seam 的 `directory-picker/*` 加 `gateway/bad-request`、`gateway/cancelled`、`gateway/internal`。
- 已归档的 [directory-picker capability seam 笔记](../../archived/architecture/2026-07-28-directory-picker-capability-seam.md)仍是原始 seam 的冻结记录;本笔记是其成员集的当前权威。
