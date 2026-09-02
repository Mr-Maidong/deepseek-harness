# Agent Note: 持久化 store 重水合时回填在存储 JSON 之后新增的字段

Status: implemented

[English](2026-08-28-client-store-rehydration-init-backfill.md) | 中文

## 问题

持久化快照 store 的状态类型在旧构建写入其 `localStorage` JSON 之后新增了顶层字段时，重水合会得到缺少该字段的对象：`attachPersistence` 用 `JSON.parse(raw)` 替换了全新初始状态，组件通过 `useStore` 读取新字段时因 `undefined` 崩溃（Studio 的 `LeftPanelMain` 在 file-tree store 新增 `sections` 后读取 `sections.workBase` 崩溃）。TypeScript 无法发现，因为字段在状态类型中非可选，而持久化 JSON 早于它。

## 曾考虑的替代方案

**升级持久化键**（如 `dsh.studio.file-tree-expanded.v1` → `.v2`）。否决作为通用修复：它丢弃旧键下保存的用户数据，并让同样的崩溃对未来每次增量状态变更潜伏，每次都要单独迁移。

**将存储 JSON 深度合并到 init。** 否决：嵌套值整体存储，猜测合并深度会复活陈旧的嵌套字段或悄悄保留半迁移对象。状态加深仍是状态拥有者的责任，由其 init 结构或新持久化键处理。

## 决策

`attachPersistence` 现在接收 store 的初始状态，并通过对普通对象根执行 `rehydrate(stored, init)` 叠加来重水合：存储的顶层字段优先，存储 JSON 缺失的字段解析为 init 值。标量、数组和 null 根整体重水合，保留避免 zustand persist 展开损坏的手写整值契约。引擎 JSDoc 与重水合测试记录边界：回填仅覆盖顶层字段。

## 结果

- 向持久化 store 的状态新增顶层字段，对旧构建写入的值现在安全；字段以 init 默认值出现，直到下次写入。
- 既有存储值保留其携带的每个字段；重水合不会丢弃或重置任何内容。
- 状态类型从未增长过的 store 不受影响。

## 验证

`packages/client/store/tests/store.client.spec.ts` 覆盖持久化/重水合对、从 init 回填存储 JSON 之后新增的字段、存储 JSON 早于当前类型时标量根整体重水合，并保留失败报告路径。复现场景（旧 JSON 缺少 `sections`、新 store 声明它）已针对重建的 `lib/index.js` 验证。
