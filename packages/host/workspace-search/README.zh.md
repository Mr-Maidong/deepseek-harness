---
description: "Host 能力：经 ripgrep 对工作区目录进行纯文本代码搜索。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-workspace-search

[English](README.md) | 中文

## 概述

`ctx.workspaceSearch` 对一个 Host 目录执行纯文本搜索，并返回带行列定位的有界一次性结果。Web GUI 的 Studio 搜索面板使用它；浏览器无法运行 `rg`，因此本缝通过 `ctx.subprocess` 在 Host 侧应答请求。搜索遵 `.gitignore` 与提供者配置的限制，并报告是否有某个限制截断了结果。

## 目录

- [使用方式](#use-this-package)
- [实现细节](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用方式

将本包作为 Host 插件行组合以注册 `ctx.workspaceSearch`，再由 Host 侧消费者（例如 Workspace Remote 控制器）读取。组合时必须同时挂载 subprocess 提供者（base bundle 中的 `@deepseek-ai/dsh-subprocess-local`），因为本地提供者经 `ctx.subprocess` 生成 `rg` 进程。

### 读取结果

`search(path, query, signal)` 返回 `{ files, fileCount, matchCount, truncated, durationMs }`。每个文件携带其完全限定的 Host 路径（按 Host 目录列表相同的分隔符风格拼接在搜索目录之下）与匹配项；每个匹配项携带 1 起始的 `line` 与 `column`、有界的 `preview`，以及作为 preview 内 UTF-16 码元偏移的 `matchStart`/`matchLength`，因此浏览器无论内容是否多字节都能用原生字符串索引切片 preview。当文件、匹配项或输出字节限制提前终止搜索时，`truncated` 为真。

-----

<a id="understand-the-implementation"></a>
## 实现细节

<details>
<summary>实现内部——点击展开</summary>

在目标目录中执行一次 `rg` 调用，参数为 `--json --fixed-strings --color never --hidden --no-messages`、`--max-filesize` 上限，以及针对 `.git`、`node_modules`、`dist`、`lib`、`build`、`coverage` 的 `--glob` 排除。二进制是打包的 `@vscode/ripgrep` 可执行文件（npm 依赖），因此无需在 Host 安装 `rg`。查询放在 `--` 分隔符之后，因此以 `-` 开头的查询绝不会被解析为标志；`--fixed-strings` 保证其为纯文本。由于刻意不传 `--no-ignore`，`.gitignore` 得到遵循。ripgrep 的字节偏移被转换为 UTF-16 码元，使浏览器能原生索引 preview；4 字节序列计为代理对。退出码 1（无匹配）是合法的空结果而非错误；退出码 2 是错误；被信号终止的子进程返回终止前收集到的内容。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无：该 GUI-host 工作区搜索缝不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定本缝把决策留给未来消费者的位置。它们是当前包约束，不是任务清单。

- **仅纯文本** — 查询绝不会被解释为则表达式；正则搜索等待第二个消费者出现。
- **无流式** — 结果是一次性且有界的；增量结果交付等待需要它的消费者。
- **无索引** — 每次调用都重新生成 `rg` 进程，因此频繁搜索的消费者每次都要付出进程启动成本。
- **单一提供者** — 目前只有本地 ripgrep 后端。沙箱执行环境需要自己的提供者，在该环境中解析 `rg`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

该动词刻意按 Workspace 作用域而非路径作用域设计：浏览器给出 `workspaceId`，由 Host 解析目录，因此搜索面板无法用任意 Host 路径探测。

</details>

**运行时不变量：** 不发布 companion。本服务只拥有一个无状态读取，其唯一关系是有界结果与 `truncated` 标志，而 Remote 控制器与搜索面板都已检查该事实。
