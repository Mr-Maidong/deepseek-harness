---
description: "Host 能力：读取工作区目录的 Git 分支与未提交代码增减数。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-git-summary

[English](README.md) | 中文

## 概述

`ctx.gitSummary` 报告一个 Host 目录的当前分支与未提交插入/删除总行数。Web GUI 的 Studio 文件树展示该状态；浏览器无法运行 `git`，因此本缝通过 `ctx.subprocess` 在 Host 侧应答请求。目录不在仓库内时报告 `null`，调用方隐藏该入口。

## 目录

- [使用方式](#use-this-package)
- [实现细节](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用方式

将本包作为 Host 插件行组合以注册 `ctx.gitSummary`，再由 Host 侧消费者（例如 Workspace Remote 控制器）读取。组合时必须同时挂载 subprocess 提供者（base bundle 中的 `@deepseek-ai/dsh-subprocess-local`），因为本地提供者经 `ctx.subprocess` 生成 `git` 进程。

### 读取结果

`summary(path, signal)` 对包含 `path` 的仓库返回 `{ branch, detached, insertions, deletions, untrackedFiles }`；没有任何仓库包含该目录时返回 `null`。`branch` 恰好在 `detached` 为真时为 `null`。行数统计覆盖相对 `HEAD` 的双向跟踪改动（已暂存与未暂存）；`untrackedFiles` 是文件数，不是行数。

-----

<a id="understand-the-implementation"></a>
## 实现细节

<details>
<summary>实现内部——点击展开</summary>

在目标目录中执行四次有界 `git` 调用：`rev-parse --show-toplevel` 决定仓库归属，失败则整次读取返回 `null`；`symbolic-ref --quiet --short HEAD` 给出分支名；`diff --numstat -z <target>` 提供行数；`ls-files --others --exclude-standard -z` 统计未跟踪文件。`HEAD` 尚未诞生的仓库改为与 git 的空树对象做 diff，而不是失败。任何非零退出都视为「该事实缺失」而非错误，因此 detached HEAD 或未诞生分支只会降级字段，不会降级整个结果。`-z` 形式保证含换行或制表符的路径仍可解析。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无：该 GUI-host git 状态缝不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定本缝把决策留给未来消费者的位置。它们是当前包约束，不是任务清单。

- **无缓存** — 每次调用都重新生成 `git` 进程，因此频繁刷新的消费者每次都要付出进程启动成本。带失效触发器（文件系统事件或会话回合边界）的缓存等待第二个消费者出现。
- **未跟踪文件按文件计数** — 未跟踪路径不贡献行数，因为按行计数需要经文件系统缝对每个文件做有界内容读取。
- **仅工作区范围** — 不报告分支相对基线分支的累计行数；契约把比较目标固定在 `HEAD`。
- **单一提供者** — 目前只有本地 `git` CLI 后端。沙箱执行环境需要自己的提供者，在该环境中解析 `git`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

该动词刻意按 Workspace 作用域而非路径作用域设计：浏览器给出 `workspaceId`，由 Host 解析目录，因此文件树无法用任意 Host 路径探测仓库状态。

</details>

**运行时不变量：** 不发布 companion。本服务只拥有一个无状态读取，其唯一关系是「非仓库返回 `null`」，而 Remote 控制器与文件树都已检查该事实。
