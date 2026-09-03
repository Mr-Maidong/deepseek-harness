# Agent Note: 灵光卡片内容区、Summary 分割线与更新时间状态栏

Status: implemented

[English](2026-09-03-studio-workbench-card-body-summary-divider-footer.md) | 中文

## 问题

灵光卡片把任务详情与模型总结直接堆叠在卡片网格内，没有任何视觉分隔，长总结读起来像任务详情的延续。卡片内容没有高度上限：长详情或长总结会撑高卡片，把兄弟卡片推出视野。而且每条灵光都带有 `updatedAt` 时间戳，卡片上却看不出内容最后何时更新。

## 决策

- **Summary 分割线**：任务详情与完成总结之间渲染一条标有 "Summary" 的分隔线（线—文本—线）。该词是 locale 文案（`workbench.summaryDivider`；zh 字典按产品外观刻意保留英文原词），语义上是 `role="separator"` 元素。
- **可滚动内容区**：详情编辑器/详情按钮与总结块现在位于 `.todoCardBody` 网格内，`max-height: 260px`、`overflow-y: auto`。溢出内容在卡片内滚动，不再撑高卡片。滚动条与文件树完全一致（`scrollbar-width: thin`、hover/focus-within 前透明、6px webkit thumb 用 `var(--studio-line)`），该变量由 StudioFrame 为其整棵子树定义。
- **底部状态栏**：每张卡片以 `.todoCardFoot` 结尾，左下角显示紧凑相对时间的更新时间。分桶来自 ui-primitives 共享的 `relativeTime`（与工作区会话行同一来源），词汇放在本包字典（`workbench.updatedNow`/`workbench.updatedAgo` 包裹 `time.*` 桶词）。面板挂载期间每 30 秒刷新一次标签；时间戳在 store 中保持 ISO 字符串。zh 的 `workbench.updatedAgo` 模板为 `{t}前更新`，一天前的卡片显示「1天前更新」。
- **展开/收起**：底栏右侧放一个图标切换按钮（`expand.webp`/`collapse.webp` 资产，与文件树相同的展开指示），收起卡片内容区（`data-collapsed` 隐藏）并可再展开。按钮保留 `aria-expanded` 与本地化 `aria-label`/`title`。完成的灵光默认收起、未完成的默认展开；收起/展开集合是按 todo id 键控的组件本地状态。
- 分割线原先由 `.todoDetail` 的 `border-top` 画，现移到 `.todoCardBody`（完成态变体移到 `[data-done] .todoCardBody`），使这条线固定在滚动区上方而不随内容滚动；编辑器不再带内部上边框，避免双线。

## Alternatives considered

**用 CSS `::after` 伪元素在详情按钮下画分割线。** 否决：标签文本是携带可访问性角色的真实内容，伪元素无法承载，且详情按钮的 hover 目标会变大。

**状态栏显示绝对时间。** 可见标签否决：相对桶与会话行模式一致；经 `toLocaleString` 的绝对时间会跟随浏览器语言而非应用 locale。

**只滚动整张卡片列表（不给卡片内容设 max-height）。** 否决：一条长总结仍会把兄弟卡片推出首屏；需求明确是有界的卡片内容区加独立滚动条。

## Consequences

- 卡片中段有界：长详情/总结滚动，头尾固定。
- 只有存在非空完成总结时才出现 "Summary" 分割线——手动完成的灵光（空总结）不显示。
- 相对时间标签在 workbench 挂载期间保持准确，由 30 秒 tick 刷新；重挂载后按 `Date.now()` 重新分桶。
- 字典新增十一个键（`workbench.summaryDivider`、`workbench.updatedNow`、`workbench.updatedAgo`、`workbench.expandDetail`、`workbench.collapseDetail`、六个 `time.*` 桶），zh 与 en 同步。

## Testing

`workbench.client.spec.tsx` 覆盖分割线（role + 本地化标签 + 位于详情与底栏之间的可滚动 body 内）、底栏标签（新更新渲染「刚刚更新」，fake timers 下 tick 保持新鲜）、以及 body 容器结构（详情与总结位于 `.todoCardBody` 内、底栏在外）。`test:gui` studio 全量保持绿色。