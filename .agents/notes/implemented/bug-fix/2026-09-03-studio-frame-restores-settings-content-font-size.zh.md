# Agent Note: Studio 框架恢复由设置驱动的对话字号

Status: implemented

[English](2026-09-03-studio-frame-restores-settings-content-font-size.md) | 中文

## 问题

Studio 布局的 `.frame` 重新声明了整条 `--dsw-font-markdown-*` 阶梯——标题、正文、表格、small、code、code-block 各角色及其像素字号——外加 `--dsh-conversation-*` 字号令牌（`turn-status-font`、`turn-status-clock-font`、`user-font-size`）和 `--dsh-conversation-*` 背景令牌（`fade-bg`、`scroll-bg`）。对话座位与工作台的 markdown 都作为 `.frame` 的后代渲染，而 CSS 自定义属性从最近的声明祖先解析，于是这些冻结的像素值遮蔽了来自 ui-theme `gradient-shadow-text.css` 的、基于 `--dsh-content-font-size` 派生的 body 级自适应阶梯。Appearance 设置里的字号偏好因此不再控制 Studio 布局内的对话文本——尽管该值仍写到了 `document.body`。

Studio 的 `ThemePresenter` 副本同样早于 ui-layout presenter 的内容字号轴：它只投影 color-scheme、暗色属性和别名令牌，从不写入或收回 `--dsh-content-font-size`，因此在 Studio 组合下（那里的 shipped ui-layout 入口被禁用），Appearance 行上的实时字号变化没有 presenter 去重绘 body 轴。

## 决策

- `.frame` 不再定义任何 markdown 阶梯或对话字号令牌。其后代解析 body 级自适应阶梯，Settings 的字号偏好因此重新控制对话文本；框架自身与 `ui-theme` 的 `:root` 完全一致的 `--dsw-font-family: 'YaHei Consolas Hybrid', monospace` 重声明只保留 studio 字体而不冻结字号。
- Studio `ThemePresenter` 补上 ui-layout presenter 的 `CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'`：`apply` 写入、`dispose` 收回，使两个副本在该轴（Studio 组合自己持有）上行为对齐。

## Alternatives considered

**把冻结阶梯改挂到 delta 变量上**（如 `calc(15px + var(--dsh-content-font-delta))`）而不是删除。否决：它保留了一份 ui-theme 已拥有的阶梯副本，今后每次阶梯改动（自适应特性自身的 h1–h4/正文/表格调整）都要镜像或再次漂移。ui-layout 的参照 `AppFrame.module.css` 一个都不定义这些令牌——studio 的遮蔽从来不是 shipped 契约。

## Consequences

- Studio 框架内对话与工作台 markdown 与界面其余部分一样跟随 Settings 字号（12–17），含标题与次要文本的共享像素 delta。
- 框架对话正文字号从冻结的 15px 回到自适应默认 14px（`--dsh-content-font-size` 的默认值），与浏览器界面其余部分在默认设置下一致。
- 被删的 `--dsh-conversation-*` 令牌在整棵树里没有消费者（对全部五个令牌的源码 grep 只返回本文件的定义），无其他回归。

## Testing

`packages/client/ui-studio/tests/theme-presenter.client.spec.ts` 固定 presenter 的字号轴：apply 以 px 发布 `--dsh-content-font-size` 并跟随快照值变化，dispose 收回该轴且不动外来内联样式。
