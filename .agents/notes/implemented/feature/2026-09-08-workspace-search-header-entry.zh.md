# Agent Note: workspace search moves to the conversation title row

Status: implemented

[English](2026-09-08-workspace-search-header-entry.md) | 中文

## Problem

工作区搜索最初是 Studio 左栏里的一条固定区带（上接工作区，下接文件树），在宽度有限的专栏里常驻一行，而它的使用是间歇性的。同时它重复占据了一个本属于会话头部的席位：标题行的工具位（`conversation.session.header.utilities`），该席位的设计用途就是右对齐的会话级工具。

## Decision

搜索移入会话标题行最右侧的工具位，结果以锚定在触发钮下方的悬浮面板呈现（`packages/client/ui-studio`）：

- `HeaderSearch` 通过 `ctx.slots.inject` 注册进 `conversation.session.header.utilities`，取最大的列表 order 保证它位于最右；触发钮切换一个门户挂载进 studio frame 节点的悬浮面板（`useAnchoredPosition` 右对齐于触发钮下方、`useDismissOnOutsidePointer` 外点关闭、Escape 关闭并归还触发钮焦点）。
- 会话作用域条目的 `workspaceId` 在注册时从工作区快照解析（`sessionIds` 包含该条目 `sessionId` 的工作区）；搜索与文件读取闭包与左栏条目的 inject 面共享。
- 面板中的结果行复用文件树的预览链路（`loading` → 携带 `focus {line, column}` 的 `ready`，读取失败则 `error`），随后收起面板。搜索能力上报完全限定的 Host 路径（由提供者在搜索目录之下拼接），因此结果命名文件的方式与 Host 目录列表一致；面板按相对工作区根目录的形式标注。预览写入经一道跨作用域桥：根注册的 inject 钩子收到 frame 独占 studio store 的烘焙 actions 并绑定 `setPreview`；会话作用域的注册方无法声明根作用域的 store，store 句柄本身也绝不跨作用域共享。
- 查询防抖（250 ms），回车立即搜索，单调请求号加 AbortController 保证只有最新请求落地；清空查询与卸载时取消。
- 左栏的内联 `SearchPanel` 区带及其 section 已从 `LeftPanelMain` 移除。

## Alternatives considered

- **保留左栏区带并增加折叠态。** 否决：常驻行高成本仍在，且一个工具被拆在两处；工具位本就是组合中右对齐会话工具的指定归宿。
- **为预览状态建会话作用域的 store 副本。** 否决：两个 store 共同持有同一个预览面；编辑器席位是根作用域、读的是 frame 的 store，副本需要额外的同步且可能与 frame 不一致。
- **沿用内联面板、不做悬浮列表。** 否决：头部没有内联结果的空间；下拉式悬浮面板是唯一既贴合席位又不挤压标题的形态。

## Consequences

- 工作区栏拿回了搜索区带的高度；文件树与工作区分摊整栏。
- 面板门户挂载进 studio frame 节点（仅在无 frame 标记时退回 `document.body`），因此继承 frame 的 `--studio-*` token 作用域，搜索面以万能预览卡片的语言重绘：半透明模糊面板、`--studio-line` 发丝线、金色强调。
- 头部条目的 `workspaceId` 按注册解析一次、非响应式；会话迁移工作区后仍沿用已解析的 id，与头部按会话的生命周期一致。
- 根条目未挂载时桥接显式报错；此外没有其他路径能触达 frame 的 store。

## Testing

`packages/client/ui-studio/tests/header-search.client.spec.tsx` 固定了门户挂载、外点关闭、Escape 归还焦点、防抖/回车/竞态纪律、清空查询、携带焦点坐标的预览发布、失败文案、截断提示，以及请求在途时不闪现旧行。