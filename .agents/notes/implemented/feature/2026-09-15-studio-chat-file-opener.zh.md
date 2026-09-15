# Agent Note: 聊天文件点击在 Studio 万能预览卡片中打开

Status: implemented

[English](2026-09-15-studio-chat-file-opener.md) | 中文

## 问题

在 Studio 组合下，点击聊天窗口中的文件链接——工具行的路径链接、产出文件 chip 或收尾消息提及——会在右侧 Sidebar 中打开文件。Studio 已经有一个万能预览卡片（通过 `studio.center.editor` 锚定在输入栏上方的 `PreviewCard`），可以带行号展示源码并嵌入渲染产物，但聊天文件手势完全绕过了它。用户不得不在对话列和右侧 Sidebar 之间切换注意力，而不是在产出文件的对话位置直接看到文件内容。

## 决策

新增可选服务接缝 `chatFileOpener`（在 `ui-chat/src/client/contract/slots.ts` 中声明为 `ChatFileOpener`），让布局拥有聊天文件打开手势的所有权。ui-chat 通过 `ctx.get('chatFileOpener')` 读取——永不注入，因此没有激活顺序耦合——当没有提供者时回退到既有的右侧 Sidebar 路由。Studio 在其根条目的 effect 中提供该服务，将每个聊天文件手势接入文件树和头部搜索已使用的同一个 `bridge.require()` 发布通道。opener 通过 `resolveWorkspacePath` 将相对路径按当前查看 Session 的工作区根目录解析为绝对路径，发布 loading → ready/error 流程并携带可选的 focus 行号（与搜索跳转使用同一通道），失败时以原始原因 reject，使 chat 视图的打开失败对话框原样展示错误。

接缝在 ui-chat 的契约模块中与 `ChatFileMentions` 一起声明，并在 `scripts/gen-cordis-catalog.ts` 的 `SERVICE_WALK_EXEMPTIONS` 中注册为由 ui-chat README 拥有的客户端上下文键。ui-studio 将 `@deepseek-ai/dsh-client-ui-chat` 和 `@deepseek-ai/dsh-util-workspace-path` 添加为 devDependencies 和 tsconfig 引用；type-only import 在构建时被擦除，不需要 `dsh.client.external` 声明。

## Alternatives considered

**将 `sidebarRight` 注入 ui-studio 并让它调用 `openResource`。** 否决：这会使 Studio 耦合到 Sidebar 包的激活顺序，且在没有组合 Sidebar 时 Studio 不可用。接缝方向反转——布局提供，消费者读取——任一侧都可以干净地组合出去。

**为文件 opener 添加基于 slot 的注册。** 否决：该手势是服务调用，不是渲染组件。Slot 用于 UI 组合；服务用于行为所有权。既有的 `chatFileMentions` 可选服务模式是完全一致的先例。

**在 ui-chat 内部硬编码 Studio 预览发布。** 否决：ui-chat 必须保持布局无关。同一个包同时服务于标准 web 布局（没有万能预览卡片）和 Studio；硬编码会破坏非 Studio 组合。

## Consequences

- Studio 组合下的每个聊天文件手势现在都在输入栏上方的万能预览卡片中打开，使文件内容与产出它的对话保持内联。
- 非 Studio 组合不受影响：当 `ctx.get('chatFileOpener')` 返回 undefined 时，ui-chat 回退到右侧 Sidebar。
- 行号导航保留：传递 `{ line }` 的工具行通过既有的 `focus` 机制将卡片定位到该行。
- opener 复用与文件树和头部搜索相同的有界读取（`uiWorkspace().readFile`）和框架 store 发布，三个生产者对同一文件共享同一身份。
- 没有新增本地化键、store 字段、持久化格式版本或会话事件——接缝是纯行为路由。

## Testing

`packages/client/ui-chat/tests/apply-inject.client.spec.tsx` 新增两个用例：一个验证提供 opener 时它收到 `(sessionId, path, line)` 且 Sidebar 保持静默；另一个验证拒绝通过注入的 promise 传播且 Sidebar 保持静默。既有的 Sidebar 回退用例保持不变。`packages/client/ui-studio/tests/chat-file-opener.client.spec.ts` 覆盖 opener 的六种行为：相对路径解析、绝对路径直通、focus 行号传播、缺失语言标签省略、读取失败的 error 状态加 reject、以及缺失工作区根的拒绝。ui-chat 和 ui-studio 的全部 497 个测试通过；deliverables、tool 和 primitives 套件（1277 个测试）保持不变通过。
