# Agent Note：工作区写入由调用方 Session 的策略围栏

Status: implemented

[English](2026-09-15-workspace-write-fenced-by-session-policy.md) | 中文

## 问题

`WorkspaceFiles.write` 经由 `ctx.fs.writeText` 发布时没有传入逐次调用的沙箱策略，于是强制执行的 fs 后端回退到部署策略，其 `workspace-write` 根是配置的根或进程 cwd。对于从项目之外启动的桌面应用（打包构建的常见情形），该根不包含 Session 的工作区，于是每次预览卡片保存都以 `file access denied under workspace-write mode` 被拒绝，而被点名的文件恰恰位于该 Session 自己拥有的工作区内。

## 决策

`write` 为线上传入的 Session 解析策略，并作为逐次调用策略交给 `writeText`。live Session 提供它最后选择的模式，而本次调用已为包含性检查解析出的根提供边界，因此围栏覆盖的正是该操作被限定于的工作区。Session 已不 live 的作用域则保留部署模式，并使用该作用域自身的根，因为读取路径本来就用同一个由 header 导出的根。

## 考虑过的替代方案

- **要求部署根与 Session 工作区一致。** 否决：部署可能根本不配置根，而打包应用的进程 cwd 也不是项目。
- **该端点跳过围栏、只依赖 `confine`。** 否决：`confine` 只用词法比较路径与作用域根，而文件系统围栏会在变更前立即重新规范化，从而收窄祖先符号链接被替换后重定向写入的窗口。
- **保留部署模式，只修正根。** 否决：Session 的 `sandbox/mode` 覆盖是该用户为该 Session 选定的策略，部署默认值不应在这一处变更上悄悄压过它。
- **用 `ctx.get('sessions')` 读取 Session 以容忍缺失的服务。** 否决：`sessions` 是本服务声明的注入，要行使写入的测试夹具就应当提供它。

## 后果

- 围栏边界跟随 Session 而非部署：部署根在别处时，Session 工作区内的保存会成功；被切换为 `read-only` 的 Session 则拒绝保存。
- 围栏拒绝不是 `workspace-file/*` 代码；它以 `gateway/internal` 穿过 Gateway，并在消息中带上路径与模式，包 README 已记录这一点。
- `tests/harness.ts` 提供了一个 `sessions` 替身，因为该夹具直接构造本服务，其声明的注入从不解析。`tests/write-fence.spec.ts` 在临时写入授权之外的目录上启动真实的 `SandboxedFileSystem` 与 `SandboxPolicyService`，因此那里的拒绝来自围栏本身。
