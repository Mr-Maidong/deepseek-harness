# Agent Note: Workbench todo cards pin uncompleted items above completed ones

Status: implemented

[English](2026-09-14-workbench-uncompleted-cards-pinned-first.md) | 中文

## Problem

Studio 工作台此前只按 `updatedAt` 倒序列出项目的待办卡片（[workbench.tsx](../../../../packages/client/ui-studio/src/client/frame/workbench.tsx)）。勾选完成会写入 `updatedAt = completedAt`，于是完成的卡片被顶到列表最上方，压在了尚未处理的事项之上。卡片较多时，随着旧卡片逐条被勾完，剩余待办不断下沉；面板最显眼的位置反而留给了不需要动作的条目。

## Decision

卡片列表改为「完成状态优先、更新时间其次」：`status === 'completed'` 的卡片排在所有未完成卡片之后，只有同一组内才比较 `Date.parse(b.updatedAt) - Date.parse(a.updatedAt)`。排序仍是 [workbench.tsx](../../../../packages/client/ui-studio/src/client/frame/workbench.tsx) 中对当前项目 `todos` 的 `useMemo` 派生结果；store 数组保持插入顺序，持久化数据不变。`Array.prototype.sort` 是稳定排序，因此同一组内时间戳相同的卡片保持 store 顺序。

已完成卡片之间依旧按完成时间排序，因为 `completeTodo` 会把 `updatedAt` 置为 `completedAt`；勾选完成后该卡片立刻沉到已完成组的最前面，而取消勾选不可能发生（完成在 store 中是终态）。

## Alternatives considered

**直接重排 store 的 `todos` 数组，而不是在渲染时派生顺序。** 否决：卡片顺序属于展示状态，而 store 是持久化、工作区共享的记录。把排名写进 store 会把视图偏好持久化，每次完成都改动持久化负载，并让数据层耦合到面板的排布方式。

**只按完成状态分组，去掉时间排序。** 否决：现有的「最近更新在前」值得保留——未完成组内最近编辑或发送的卡片留在顶部，已完成组内最新的总结排在最前。

**把 `in_progress` 作为第三个层级排在 `pending` 之前。** 否决：需求只要求未完成优先于已完成；而且 `sendTodo` 在卡片开始执行时已经刷新 `updatedAt`，进行中的卡片无需第二个排名轴就能到达未完成组顶部。

**用标题或分隔线在两组之间划界。** 否决：超出范围——仅靠排序即可满足需求，而带标签的分区边界会引入该面板并不需要的文案与卡片装饰。

## Consequences

未完成的工作无论多旧都排在最前，完成一张卡会立即改变其位置。两组内部的时间排序不变，时间戳相同时保持 store 顺序。没有新增文案、store 字段、持久化格式版本或会话事件——排名完全由 store 已有的 `status` 与 `updatedAt` 派生。

## Testing

[workbench.client.spec.tsx](../../../../packages/client/ui-studio/tests/workbench.client.spec.tsx) 覆盖新的排名：一个用例完成最近更新的卡片，断言未被触碰的未完成卡片仍在其上；另一个用例按创建顺序完成两张卡片，断言已完成组仍按完成时间排序。既有的「最近更新在前」与「编辑后重排」用例保持不变并通过。