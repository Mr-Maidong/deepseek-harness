# Agent Note: Studio 灵光完成总结落入工作区存储，完成后为终态

Status: implemented

[English](2026-09-03-studio-todo-completion-workspace-persistence.md) | 中文

## 问题

Studio 灵光池的任务是工作区维度的：`project-todo-store` 以 `storeScope: 'workspace'` 注册，并按工作区持久化一个任务池（`dsh.studio.project-todos.v1`），同一工作区的每个会话共享同一份任务列表。但模型的完成总结却是会话维度的：`workbench_complete` 把 `studio/todo-complete` 事件追加到执行会话的日志，`studioTodoCompletions` 会话投影按会话折叠它，而 workbench 把该投影**只读叠加**在工作区任务之上（`visibleProjects`）。由于 workbench 绑定到*当前打开*会话的投影存储，切换会话会改变可见的完成总结：在会话 A 完成的任务在会话 B 的视图里回到 `pending`、总结消失，刷新后则显示当前会话投影恰好携带的内容。工作区 store 自己的 `completion` 字段与 `completeTodo` action 早已存在，却从未被模型路径喂入。

## 决策

工作区任务 store 是完成状态的唯一事实源；会话投影降级为写穿通道。

- `workbench.tsx` 不再把 `studioTodoCompletions` 叠加到渲染的任务上。一个 `useEffect` 把绑定会话投影中看到的每条完成总结经 `actions.completeTodo` 折入工作区 store——挂载时执行（覆盖先前访问时投影基线已携带的完成），并在每次投影变化时执行（覆盖会话打开期间落地的完成）。渲染直接读 store 的 `todo.status` / `todo.completion`，因此同一工作区每个会话看到的完成状态一致，且刷新后仍在。
- 完成是终态。`project-todo-store` 的 action 拒绝改动已完成任务：`updateTodoStatus` 永不移出已完成（也不能直接置为 `completed`——只有 `completeTodo` 能到达该状态，因此总结总是被附上），`updateTodoDetail` 忽略编辑，`removeTodo` 跳过已完成记录，`completeTodo` 先到先得（重放的投影或之后的再次完成都不会重写终态记录）。workbench 对已完成任务禁用复选框、编辑、发送、写回与删除控件。新需求创建新灵光。

## Alternatives considered

**保留投影叠加、只修重开开关。** 否决：维度错配仍在——切换打开会话后总结仍会消失。

**在 host 端按工作区聚合完成（把 `sessionProjections` 改成工作区作用域注册表）。** 否决：会话投影机制整体是按会话的（从会话事件折叠、按会话键控）；为一个功能改写子系统的语义等于分叉。

**完成数据走服务端持久化（工作区服务）而非客户端 store。** 否决：项目 todo 目前是纯客户端本地模型；引入服务端持久化会破坏无服务器本地场景，并新增一个 store 已覆盖的服务接缝。

**用 `reopenedAt` 守卫允许重开已完成任务。** 产品裁决否决：确认完成的灵光即冻结，后续工作新建灵光。终态消除了 reconcile 与重开的竞态（无需守卫时间戳）。

## Consequences

- 折入工作区 store 的模型完成总结对共享该工作区的每个会话可见，刷新后仍在，与工作区共享设计一致。
- Reconcile 幂等：重放同一投影（在基线已携带的会话下重挂载，或重复事件）因 `completeTodo` 先到先得而成为空操作。
- 残余边界：当 workbench 绑定会话 B 时落在会话 A 的完成，只在用户回到会话 A 时被折入（投影只对绑定会话可见）。终态使这无害——没有错误状态风险，只有延迟可见。执行通常发生在用户正在观看的打开会话中，常见流程即时折叠。
- 已完成任务在 UI 与 store 中均不可变；用户为新工作创建新灵光。
- 用户仍可手动把未完成任务标记完成（空总结、`completedBy: 'user'`）；该状态同样终态。

## Testing

`project-todo-store.client.spec.ts` 覆盖终态语义：完成后不可重开、不可编辑详情、不可删除、不可重写（模型与用户两条路径）。`workbench.client.spec.tsx` 以真实 store 与投影 fixture 驱动组件：从 store 渲染完成、见到投影即折叠、挂载时折叠投影基线、投影清空（切换会话）时保持 store 内已完成、用户标记完成同样终态。
