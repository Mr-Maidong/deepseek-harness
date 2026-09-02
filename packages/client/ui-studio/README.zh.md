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

Host 的 directory-picker browse 能力负责校验并限制文本读取。workspace Client 服务将结果映射为预览，并根据扩展名生成语言标签。点击文件会通过 owner 回调发布带状态的预览（`loading` → `ready`/`error`），悬浮卡片自己展示读取状态，文件树保持渲染。StudioFrame 持有预览状态，并通过 `studio.center.editor` 将 CodePreview 渲染为锚定在输入栏上方的浮卡片。文件条目保持使用 Host 返回的完整路径。

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

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

预览使用已有编辑器槽，因此未来编辑器可以替换展示，而不必增加第二条组合路径。

</details>
