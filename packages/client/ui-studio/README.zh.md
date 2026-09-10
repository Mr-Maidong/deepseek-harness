---
description: "面向组合 Web 客户端的 Studio 工作区导航与只读源码预览说明，服务于用户和维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-studio

[English](README.md) | 中文

## 概述

Studio 提供三栏工作区，用于导航会话、浏览当前工作区、预览有大小限制的文本文件和管理项目待办。Web 客户端需要编辑器式界面与只读文件预览时，应选择此包。文件读取始终经过 Host/Remote 路径，不会让浏览器直接访问文件系统。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 Web 客户端需要工作区导航、文件树、只读源码预览和项目案台时，挂载 Studio。

### 何时选择

当需要编辑器式布局时选择 Studio。当其他布局拥有展示层时，选择较低层的工作区包。

### 最小配置

Web 组合会加载此包，包本身没有用户可配置字段。生成的[配置目录](../../../docs/config-catalog.zh.md)是所有可接受配置字段的完整来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 的 directory-picker browse 能力负责校验并限制文本读取。workspace Client 服务将结果映射为预览，并根据扩展名生成语言标签。点击文件会通过 owner 回调发布带状态的预览（`loading` → `ready`/`error`），悬浮卡片自己展示读取状态，文件树保持渲染。StudioFrame 持有预览状态，并通过 `studio.center.editor` 将 PreviewCard 渲染为锚定在输入栏上方的浮卡片；该卡片是按 kind 驱动的万能容器（`code` 展示源码，`iframe` 在沙箱 frame 内嵌渲染产物，如产出的 HTML）。文件条目保持使用 Host 返回的完整路径。展开一个文件夹会重新读取它，并且展开时会重读它下面所有仍处于展开状态的文件夹，因此折叠过的子树恢复出来的是目录当前的内容；某次重读失败时，屏幕上已有的条目保持不变。

源码文件渲染为文件文本与行号 gutter 并列，行号标出搜索命中的行，以及“引入”气泡引用的行；点击某个行号即引用该行。读取中、失败和内嵌产物状态不带 gutter，行号也不会进入被复制的选区。

工作区搜索位于会话标题行最右侧的工具位（`conversation.session.header.utilities`）：搜索触发钮在其下方右对齐展开一个悬浮结果面板，样式沿用万能预览卡片的 `--studio-*` token 语言并门户挂载进 studio frame 节点，底层是 Host 的 ripgrep 纯文本搜索（`remote.workspace.search`）。查询有防抖，回车立即搜索，单调请求号加 AbortController 保证只有最新请求的结果会落地。结果的文件路径是完全限定的 Host 路径，与文件树和有界读取使用同一身份；面板按相对工作区根目录的形式标注。点击匹配项走同一条预览链路（滚动到匹配的行列）并收起面板。头部条目在注册时解析会话所属的工作区，并经根条目桥接把预览发布进 frame 独占的预览 store——会话作用域的注册方无法声明根作用域的 store。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——客户端分层与运行时组合。
- [文件系统能力 seam](../../../.agents/notes/implemented/architecture/2026-06-17-filesystem-capability-seam.zh.md)——文件系统所有权与策略。
- [Workspace controller 包](../../api/workspace-controller/README.zh.md)——工作区 Remote 操作。

-----

<a id="model-experience"></a>
## 模型体验

### 文件预览

#### 模型看到的内容

无。Studio 预览是浏览器侧状态，不会进入模型请求；`studio.center.editor` 槽只接收它用于浏览器渲染。

#### Token 影响

直接影响为零。

#### KV 缓存影响

独立于模型请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

预览有意保持只读和有大小限制；它不会编辑、搜索或流式读取大文件。

- **不支持编辑**——用户可以查看内容，但必须使用其他工具修改文件。
- **扩展名标签有限**——未知扩展名显示为纯文本。
- **目录列表在展开时刷新**——展开一个文件夹会重读它以及它下面所有仍展开的文件夹，但在内容变化时始终保持展开的目录会继续显示它展开时的内容，因为浏览路径没有文件系统 watch。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

预览使用已有编辑器槽，因此未来编辑器可以替换展示，而不必增加第二条组合路径。

</details>
