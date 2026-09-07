# Agent Note: Studio 文件树的 Git 状态能力缝

Status: implemented

[English](2026-09-05-git-summary-capability.md) | 中文

## 问题

Studio 文件树需要显示当前工作区所在的 git 分支，以及未提交改动增删了多少行。浏览器无法运行 `git`，而现有 Host 能力都不报告仓库状态：`ctx.fs` 只读文件，不理解工作树；Workspace 记录只存目录路径。此外，展示侧不能去询问任意 host 目录，因为决定文件树显示什么是浏览器。

## 决策

新增一条窄 Host 能力缝，并在其上开一个 Remote 动词：

- **`packages/host/git-summary`** 声明 `GitSummaryRuntime`（`ctx.gitSummary`），只有一个方法 `summary(path, signal)`，默认导出 `LocalGitSummary`。提供者经 `ctx.subprocess` 执行四次有界 `git` 调用（`static inject = ['subprocess']`），返回 `GitSummaryResult`——分支、detached 标记、增删行总数、未跟踪文件数——目录不被任何仓库包含时返回 `null`。
- **`workspace/gitSummary`** 是 `WorkspaceController` 上的 `@Remote` 动词，接受 `{ workspaceId }`，通过 Workspace 注册表解析目录后委托执行。它用 `ctx.get('gitSummary')` 读取能力，未组合提供者时抛出 `workspace/git-summary-unavailable` Remote 错误码。
- **`packages/client/ui-studio`** 通过注入的 `gitSummary` 回调拉取数据，并在文件树下方渲染一条 footer 栏。这条栏本身就是按钮：点击栏内任意位置都会重新读取，而较新的一次读取会取消上一次。拉取属于插件的 inject face；组件只拿到数据与刷新回调，因此没有任何组件触碰 `ctx`。入口的 Cordis inject 列表同时声明 `remote` 与 `remote.workspace`——只声明 `remote` 就去读嵌套的 `ctx.remote.workspace`，会在构造请求之前抛出。

未提交改动以 `HEAD` 为基准统计（已暂存与未暂存合并计算）；`HEAD` 尚未诞生的仓库改为与 git 的空树对象做 diff，这样首次提交前的计数依然有意义。

## 后果

- web bundle 多组合一个 Host 行；所有使用生成的 `WorkspaceRemote` face 的消费者——包括 `packages/api/workspace-controller` 与 `packages/api/session-controller` 的测试替身——都新增 `gitSummary` 成员。
- 每次刷新这条 footer 需启动四个进程。没有任何缓存，因为只有一个由用户主动触发的消费者；引入后台轮询的消费者必须先有失效触发器。
- 非仓库目录与 detached head 只降级单个字段而不让整次读取失败，因此这条栏始终可见：`null` 渲染 `Git 未初始化`，读取被拒时渲染 `Git 状态不可用` 并把 Host 的错误消息放进栏的 tooltip，未选中工作区时渲染 `未选择工作区`。
- 该读取只对浏览器可见。不写 session 事件，因为没有内容进入模型请求。

## 考虑过的替代方案

- **扩展 `ctx.fs` 增加 git 查询。** 否决：文件系统契约里没有仓库概念，拓宽它会把工作树语义塞进文件策略代码。
- **由 Remote 动词接受浏览器传来的目录路径。** 否决：那样浏览器就能探测任意 host 路径的仓库状态。接受 `workspaceId` 把路径选择留在拥有注册表的 Host 侧。
- **报告分支相对基线分支的累计计数。** 延后：它需要先确定基线 ref 的解析规则，而已确认的展示需求是未提交改动。
- **每次会话回合结束时刷新。** 延后：本缝无缓存，回合结束刷新会在与文件树无关的活动上启动 git 进程。
