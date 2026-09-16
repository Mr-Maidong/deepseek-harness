# Agent Note：Studio 工作区列表用矩阵动画标示运行中的会话

Status: implemented

[English](2026-09-16-studio-running-session-status.md) | 中文

## 问题

Studio 的工作区列表此前用同一个静态会话图标渲染每个会话，因此运行中的会话与空闲会话看上去完全一样。原生工作区浏览器（`ui-workspace`）已用 `StateDot` 的 `ongoing` 像素矩阵动画回答这个问题；而工作区卡片一旦收起，会话行被完全隐藏，就再也看不到该工作区里有任何内容在运行。

## 决定

`WorkBase` 读取 `SessionListState.byId` 本就携带的 `running` 位，并在两处渲染来自 `@deepseek-ai/dsh-client-ui-primitives` 的 `StateDot state="ongoing"`：

- 运行中的会话行用该动画替换静态 `SessionIcon`。动画保持其原生 10px 尺寸并置于固定的 16px 槽位内，因此行标题不会位移，像素格也不会被重采样成非整数倍。
- 收起的工作区卡片在任一可见会话运行期间，把该动画渲染在工作区名称的正前方；没有运行会话时完全不渲染状态槽位，因此空闲的收起卡片不会在名称旁留下空白占位。

`StateDot` 是 `aria-hidden` 的，因此两处都通过视觉隐藏的 span 携带由 locale 拥有的 `session.running` 标签。运行行的状态点保持状态调色板自身的运行色，而不是给静态图标上色的当前项金色。

## 考虑过的替代方案

- **把信号放到「工作区」区域标题上，而不是卡片上。** 已否决：收起该区域会连同工作区卡片及其名称一起隐藏，指示器将不指向任何具体工作区，且已确认的需求是收起的卡片。
- **在收起的卡片里即使没有运行也保留头部槽位。** 已否决：这会在工作区名称旁留下空白占位，读起来像状态缺失，而不是状态安静。
- **在所有卡片（无论展开还是收起）里常驻头部状态槽位。** 已否决：这会让每个工作区名称始终被状态列缩进，而该动画只在会话行被隐藏处才有信息量。
- **新增一个 Studio 本地的 CSS 动画，而不是复用 `StateDot`。** 已否决：这会重复原生工作区浏览器的矩阵追逐动画、其调色板及其 reduced-motion 归属。
- **把替换扩展到 `completed` 与 `pendingInteraction`。** 不属于本次决定：Studio 列表没有承载这些状态的界面，需求只是运行中信号。

## 影响

- `studio-left-panel` 命名空间在两本字典中各新增一个键 `session.running`。
- 动画的调色板（`--dsw-static-deepseek-450`）、1 秒追逐与 reduced-motion 行为仍归 `ui-primitives` 所有；Studio 只新增布局槽位。
- 收起卡片的第一个可见会话开始运行、或最后一个停止运行时，其名称会移动这个 16px 槽位的宽度；不渲染占位值得这点位移。
- 空闲行保持静态图标；没有导出、配置字段、Session 事件或线上格式发生变化。

## 测试

`packages/client/ui-studio/tests/workbase-running-status.client.spec.tsx` 用桩会话列表渲染该面板，固定以下行为：运行行的 `svg[data-state="ongoing"]` 位于其标题之前、空闲行没有动画、收起卡片的动画位于工作区名称之前、展开卡片的头部保持干净、卡片收起时动画出现，以及空闲的收起卡片既没有动画也没有占位槽位。