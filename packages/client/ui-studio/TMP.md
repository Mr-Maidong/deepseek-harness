## 灵光池待办数据存储设计

### 目标

将待办拆分为任务定义、执行状态和完成总结三部分。用户创建的任务描述保持不变；模型完成任务后，将整体方案、实现路径、修改文件和验证结果结构化写回同一条待办。

### 数据结构

```ts
type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

type TodoCompletion = {
  summary: string
  implementationPath: string[]
  changedFiles: Array<{
    path: string
    purpose: string
  }>
  verification: Array<{
    command: string
    result: 'passed' | 'failed' | 'skipped'
    note?: string
  }>
  completedAt: string
  completedBy: 'model' | 'user'
}

type ProjectTodo = {
  id: string
  projectId: string
  title: string
  detail: string
  status: TodoStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  completion?: TodoCompletion
  sourceSessionId?: string
  sourceTurnId?: string
  tags?: string[]
}
```

`title` 是 checkbox 标题行中的短任务名称；`detail` 保存用户创建任务时的目标和上下文；`completion` 保存任务完成后的总结，不覆盖原始详情。长期使用 `status` 作为唯一状态来源，避免 `done` 与状态字段产生矛盾。

### 状态规则

- `pending`：新建任务后的默认状态。
- `in_progress`：模型开始实际处理任务后设置。
- `completed`：实现完成并通过必要验证后设置，并同时写入 `completion`。
- `blocked`：因权限、依赖或缺少用户决策而无法继续。

状态变更必须同时更新 `updatedAt`。完成时写入 `completedAt`，并在同一个提交点写入完成总结，不能先发布完成状态再异步补总结。

### 模型完成总结

模型完成待办后应写入以下信息：

- `summary`：面向用户的结果摘要。
- `implementationPath`：实际采用的整体实现步骤。
- `changedFiles`：修改过的文件及每个文件的用途。
- `verification`：实际运行过的检查命令、结果和必要说明。
- `completedAt`：完成时间。
- `completedBy`：记录由模型还是用户确认完成。

验证记录只填写实际执行过的命令，不填写计划执行但未运行的检查。

### 写回接口

模型不应直接修改 React 组件状态，而应调用待办存储层的完成操作：

```ts
type TodoCompletionInput = {
  todoId: string
  summary: string
  implementationPath: string[]
  changedFiles: TodoCompletion['changedFiles']
  verification: TodoCompletion['verification']
}

completeTodo(todoId: string, completion: TodoCompletionInput): void
```

`completeTodo` 负责检查待办存在、写入 `completion`、设置 `status: 'completed'`、补齐完成时间、更新 `updatedAt` 并发布一次状态变化。

### 存储层与 UI 分工

```text
ProjectTodoStore
  负责项目和待办的增删改查、状态变更与完成总结写回

Workbench UI
  负责展示待办、checkbox 状态和完成总结，触发 store actions

模型执行层
  在任务真正完成并完成验证后调用 completeTodo
```

建议的 store actions：

```ts
type TodoActions = {
  addProject(input: { title: string }): void
  removeProject(projectId: string): void
  addTodo(input: { projectId: string; title: string; detail: string }): void
  updateTodoDetail(todoId: string, detail: string): void
  updateTodoStatus(todoId: string, status: TodoStatus): void
  completeTodo(todoId: string, completion: TodoCompletionInput): void
  removeTodo(todoId: string): void
}
```

### 实现路径

1. 将当前 `ProjectTodo` 从 `done: boolean` 改为 `status: TodoStatus`，补充时间字段和 `completion`。
2. 将示例数据和新增待办逻辑迁移到新字段；checkbox 根据 `status === 'completed'` 展示。
3. 在 store 中集中实现 `updateTodoStatus` 和 `completeTodo`，保证状态与总结原子更新。
4. 调整灵光池卡片：标题行显示 checkbox 和任务标题，详情显示任务定义，完成后显示完成总结摘要。
5. 为模型执行层提供 `completeTodo` 调用入口，并让模型在实际实现和验证结束后写回总结。
6. 第一阶段保持会话内 store；后续按 workspace 持久化，再根据需要接入 session event 以支持回放。
7. 增加组件测试，覆盖新建、状态切换、完成总结写回和阻塞状态；再运行 `pnpm run test:gui` 与必要的 `DSH_SNAPSHOT=replay pnpm run test:web`。

### 推荐 README 说明

右侧灵光池按项目记录待办。每条待办包含任务标题、详细说明、执行状态和完成总结。标题行使用 checkbox 切换状态，模型完成任务后将整体方案、实现路径、修改文件和验证结果写入该待办的完成总结中。项目和待办暂时属于会话内状态，后续可接入持久化存储。
