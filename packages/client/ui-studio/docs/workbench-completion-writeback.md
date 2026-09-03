# 灵光工作项执行结果写回方案

> 目标：任务在对话中执行完成后，**一键**调用模型把执行总结（整体方案 / 实现路径 / 修改文件 / 验证结果）写回灵光池同一条待办的 `completion` 数据结构，并保证可回放、唯一权威来源、模型输入与日志一致。

> 实现状态（2026-09-03）：已落地为「工作区 store 权威 + 会话投影作为 reconcile 触发」。`workbench.tsx` 不再把 `studioTodoCompletions` 投影叠加渲染；一个 `useEffect` 把绑定会话投影里的 completion 经 `actions.completeTodo` 折入工作区 store，渲染直接读 store 的 `todo.status` / `todo.completion`，因此同一工作区各会话看到的完成一致且刷新后仍在。完成是终态：store 拒绝把已完成任务重开/改详情/删除/重写，workbench 对已完成任务禁用复选框、编辑、发送、写回与删除；后续工作新建灵光。详见 Agent Note `2026-09-03-studio-todo-completion-workspace-persistence`。本文档其余部分保留为当时的方案推演与分阶段讨论。

当前现状（已核实）：

- 浏览器端 store `src/client/frame/project-todo-store.ts` 已实现 `TodoCompletion` 结构、`completeTodo` 原子写回的 action 与 `completedBy: 'model' | 'user'` 标记。
- 待办经 `workbench.tsx` 的 `sendTodo` / `sendProject` 通过 `sendToChat` 调用 `session.prompt(..., 'queue')` 发送给模型，发送前已置 `in_progress`。
- **缺口**：模型执行时没有写回入口——模型无法把「它实际做了什么」的结构化总结回填到那条待办上。现有勾选 checkbox 是空总结的 `completedBy:'user'`，不产生模型总结。

本方案遵循两条仓库铁律：

1. **模型可见 ⟺ 已记录**：待办完成总结是模型可见/模型产出的内容，必须由模型通过工具调用产生，并作为**会话日志事件**提交；UI 只从已提交的事件渲染。浏览器 store 只拥有 UI 创建的任务定义与本地布局，模型产出的完成总结以会话日志为唯一权威来源，二者用稳定 todoId 对账。
2. **插件而非改 loop / 工具注册在服务端**：写回工具在 agent-loop 运行的进程（node/worker）里注册到 `ctx.tools`，与 `@deepseek-ai/dsh-tool-todo` 的 `todo_write` 同构；浏览器侧只负责「一键」按钮与渲染。

```text
                    ┌────────────────────── node / worker（agent-loop 运行处）──────────────┐
 UI(浏览器) 一键按钮   │   ctx.tools 注册:  workbench_complete(todoId, summary,           │
   │ 发送指令提示词      │                       implementationPath, changedFiles,          │
   ▼                    │                       verification)                                │
 session.prompt(...) ──┼─► 模型执行任务并调用 workbench_complete ──► session.append(       │
   │                    │        'studio/todo-complete', { … completedAt, completedBy:'model'})│
   │                    │  sessionProjection: studioTodoCompletions（按 todoId 折叠）         │
   ▼                    └─────────────────────────────────────────────────────────────────────┘
 灵光池卡片 ◄──────── 按 sourceSessionId 对账 + 按 todoId 合并「已提交事件」渲染 completion
```

---

## 1. 写回工具：`workbench_complete`（服务端插件）

新增服务端（node）插件，负责三件注册，全部走 `ctx.effect` / 声明合并不变式：

- `ctx.tools.register(defineTool({ name: 'workbench_complete', … }))` —— 模型写回入口。
- `SessionEventMap` 声明合并新增 `'studio/todo-complete'` 事件（参照 `todo/write`）。
- `ctx.sessionProjections.register('studioTodoCompletions', …)` —— 把 `studio/todo-complete` 按 `todoId` 折叠成 `Record<todoId, Completion>|null`，供浏览器投影读取。

### 工具 Schema（参数）

```ts
type WorkbenchCompleteArgs = {
  todoId: string            // 任务行携带的稳定 id，原样回显
  summary: string           // 面向用户的结果摘要
  implementationPath: string[]          // 实际采用的实现步骤
  changedFiles: Array<{ path: string; purpose: string }>
  verification: Array<{
    command: string
    result: 'passed' | 'failed' | 'skipped'
    note?: string
  }>
}
```

- 校验：`trim` 后 `todoId`、`summary` 非空；`result` 走 enum；对象属性 `additionalProperties: false` —— 拒绝未知/嵌套键，保证「模型以为写下的 = 日志记录」。
- 执行：无 `exec.agent`（非 agent 调用者）→ 抛 `Error: workbench_complete requires an owning agent session`（与 `todo_write` 一致，绝不静默 no-op）。有则：`completedAt = new Date().toISOString()`、`completedBy: 'model'`，`exec.agent.session.append('studio/todo-complete', { todoId, summary, implementationPath, changedFiles, verification, completedAt, completedBy })`。
- 输出：稳定、可断言语义的成功文本（如 `Recorded completion for todo <id>` 加上已回写条目的要点计数）+ `presentCall` 卡片（`kind:'diff' | 'generic'`）。

工具的描述（模型侧）明确指示：从任务行中读取 `todoId` 并**逐字回显**；仅在真正完成并实际跑过验证后调用；验证记录只填实际执行过的命令，不填计划项。

## 2. 上事件：`'studio/todo-complete'`

参照 `todo/write` 增补 `SessionEventMap`（声明合并在服务端插件内，其 payload 类型单一归属一处并 re-export 供 client aggregate 使用）。事件是新增类型，不构成结构性格式变更，无需 bump `SESSION_FORMAT_VERSION`。payload 为上面的 `WorkbenchCompleteArgs` + `completedAt`、`completedBy:'model'`。事件即 UI/回放状态（非第二条模型消息）。

## 3. 唯一权威来源与 UI 对账

- **权威来源 = 已提交的 `studio/todo-complete` 事件**。浏览器 store 不再是完成的权威，而是从事件派生的缓存（派生 = 权威来源上重建，符合「从一个权威来源派生缓存/提示/UI/回放」）。
- 浏览器侧按待办的 `sourceSessionId` 绑定会话，用运行时投影 hook 读取 `studioTodoCompletions`，按 `todoId` 合并到卡片渲染；未知 id（serv 端无法查 store）自然不命中任何卡片而被丢弃——写回是「对话→灵光池」单向对账，不反向改对话。
- 为降低侵入，**阶段性落地**：P0 先让事件监听（在浏览器端订阅 `sourceSessionId` 会话）调用既有的 `actions.completeTodo`，store 仍作为渲染来源，事件是持久/回放默认值；P1 切到投影优先。两者都满足「先提交事件、再从已提交事件更新」，提交点是事件 append，之后的派生态一律在提交点成功后。

## 4. 「一键」UX（用户诉求核心）

在待办卡片上新增「生成总结并写回」按钮（`in_progress` / `completed` 状态可用；无 `sourceSessionId` 或会话不可用时禁用并给提示）：

1. 点击 → 向该待办的 `sourceSessionId` 会话排队一条用户消息（`queue`）：

   ```text
   灵光任务「<title>」（todoId <id>）已执行。请将本次执行的整体方案、实现路径、修改文件与验证结果调用 workbench_complete 写回同一条待办。
   ```
2. 模型（服务端，工具所在处）据此调用 `workbench_complete` → 事件落日志 → 灵光池卡片更新显示总结。
3. 幂等可重按；模型未调用工具时按钮保持可用、不误判。

配套改造 `sendTodo` / `sendProject`：发送指令时在提示词前部附上待办的稳定 `todoId`（`--todo: <id>` 或紧凑 JSON 行）。因为这是用户文本，天然进入日志，满足「模型可见 ⟺ 已记录」。工具描述要求模型逐字回显该 id。注意 `completedAt/completedBy` 由工具执行者补齐，不要求模型编造时间戳。

## 5. 分包与装配

- 写回工具必须运行在 agent-loop 侧，**不能**放进纯浏览器插件 `ui-studio`（其 `src/index.ts` 目前是空 `apply()`，agent-loop 也不在浏览器进程）。新增服务端插件 `@deepseek-ai/dsh-studio-workbench`（依赖 `dsh-tools`、`dsh-session`、`dsh-session-projection` 类型），与 `ui-studio` 浏览器插件同属 studio 套件。
- 装配：在 studio 组成（`cordis.patch.yml` / `studio-suite.patch.yml`）与 web-app 包 manifest 里声明新行，通过 `verify-cordis-config` 校验依赖边；`pnpm --filter ui-studio bundle` 前先重建。
- `ui-studio` 浏览器侧：加按钮（`workbench.writeBack` 等 locales）+ 投影/事件对账读取。product copy 中文、注释英文。

## 6. 测试 / 门禁 / 文档（仓库红线）

- 单元：校验失败路径（空 todoId/summary、未知 result、额外键）、事件 payload 形状、非 agent 调用被拒、投影折叠（last-wins per todoId）。
- 关键无密钥快照：真实可运行示例，走完「发待办→模型调 `workbench_complete`→落事件→UI 渲染总结」，产出组装后 transcript。
- `pnpm run test:gui`（客户端套件）+ 改动可见浏览器输出时 `DSH_SNAPSHOT=replay pnpm run test:web`。
- 非平凡变更：同 PR 附 Agent Note（仓库级规则）。
- 文档：更新 `TMP.md` 的实现路径条目、`README.md` / `README.zh.md`（Model Experience、Known Limitations——当前还停在 store 持久化未接 `.dsh/storages` 的说明上）。

## 7. 边界与权衡

- **todoId 信任**：服务端工具看不到浏览器 store，只能信任模型回显的 id；未知 id 在 UI 侧被丢弃，不产生脏数据。可选：工具额外接受 `expectedTitle` 做软校验（本期可不做）。
- **不反向作用**：写回只作用于灵光池卡片，不改写对话内容。
- **两处状态来源的短期并存**（P0 store 渲染、日志为权威）是刻意的过渡：提交点唯一（事件 append），派生更新在其后。当前实现已采用投影优先；浏览器 store 仍只负责任务定义和用户直接勾选完成，消除模型写回的双写。
