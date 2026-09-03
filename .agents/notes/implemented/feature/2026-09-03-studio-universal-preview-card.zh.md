# Agent Note: 万能预览卡片（代码、HTML/iframe）

Status: implemented

[English](2026-09-03-studio-universal-preview-card.md) | 中文

## 问题

Studio 的浮动只读预览卡片只能把源文件当代码展示。同样的卡片形态期望扩展为后续能力——用 iframe 直接渲染产物（HTML，以及日后的其他可渲染输出）。卡片需要一个按内容选择展示模式的通用容器，代码预览成为若干 kind 之一。

## 决策

`StudioPreview` 所有者数据新增 `kind` 判别字段：`'code'`（既有带语言标签的源码视图）或 `'iframe'`（内嵌产物内容的沙箱 frame）。每个状态都携带 kind，使读取进行中或失败时卡片保持一致。`CodePreview` 更名为 `PreviewCard`，并按 `kind` 分发：code 渲染 `<pre>/<code>` 源码视图；iframe 渲染 `<iframe>`，把内容经 `srcDoc` 放进沙箱（`allow-scripts allow-forms allow-popups`，刻意不含 `allow-same-origin`），使脚本在完全不透明的源中运行，模型产出的 HTML 无法触及应用源。文件树按所选文件扩展名选定 kind——`.html`/`.htm` 打开为 iframe，其余均按代码——因此选中产物 HTML 文件会立刻显示渲染后的制品而非原始源码，无需新的人机可见控件。卡片的 `aria-label`/区域标题保持本地化（`preview.title` 对新增的 `preview.html`）。

## Alternatives considered

**只准备容器，所有 kind 暂不启用。** 产品确认后否决：iframe 通路现在就该对 HTML 生效，让扩展点在用起来而非休眠。

**用 URL/srcdoc 的 `<object>` 或外部标签页承载。** 否决：沙箱 iframe 上的 `srcDoc` 让制品留在卡片内，同时外层文档永不加载远程或宿主相对资源。

## Consequences

- 卡片成为按 kind 决定的万能容器：新增展示模式只需要新的 kind 加一个渲染分支，无需改动浮动卡片或插槽接线。
- 产物 HTML 文件现在直接渲染（沙箱化、无交互主访问），不再显示为源码。
- `kind` 出现在每个 `StudioPreview` 状态上，所有预览生产者都必须设置它；今日的唯一生产者是文件树。
- 字典新增一个键（`preview.html`），两个词典同步；区域标签/aria-label 本地化为「HTML 预览」。

## Testing

`file-tree-preview.client.spec.tsx` 现在对树发布的每个状态（code 与 iframe 的 loading/ready/error）断言 `kind`，并断言 iframe 卡片渲染出 `srcdoc` 等于产物内容的沙箱 `<iframe>`，而 code 卡片仍显示源码视图。`test:gui` studio 全量保持绿色。
