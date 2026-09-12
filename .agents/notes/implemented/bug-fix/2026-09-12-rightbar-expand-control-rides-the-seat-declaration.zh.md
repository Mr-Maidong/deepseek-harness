# Agent Note: 右栏展开按钮随面板席位的声明一同注册

Status: implemented

[English](2026-09-12-rightbar-expand-control-rides-the-seat-declaration.md) | 中文

## Problem

studio 组合禁用了 ui-layout,由自己重新声明各顶层席位,而它的框架没有右列。它声明 `rightbar` 只是为了维持面板侧注册者的存活,但框架从不渲染该席位——而 ui-sidebar-right 的展开按钮位于会话 header,那个席位由 ui-conversation 声明,因此确实渲染了。于是 studio 显示了一个按钮:点击后设置一个不可见的展开状态,什么面板都不会出现;按钮自身随即消失,背后什么都没有。

## Decision

展开按钮改为在 ui-sidebar-right 的 `rightbar` 声明作用域内注册:面板席位、会话席位和 header 控件作为同一份贡献一起安装、一起回滚。不声明 `rightbar` 席位的外壳——现在的 studio 组合——让三者一起等待,而不是在会话 header 里立一个死控件。服务(`ctx.sidebarRight`、`ctx.sidebarRightTabs`)仍在 apply 顶层提供,因此所有消费者照常激活。

## Alternatives considered

- **保留 studio 的席位声明,在组件里隐藏按钮。** 拒绝:这需要在 `ctx.layout` 上加一个「本外壳没有右列」的能力标志,而 slot 声明本身已经精确表达了这件事。
- **在 studio overlay 中禁用 ui-sidebar-right 行。** 拒绝:有四个包消费它的服务,禁用该行会让它们一起搁浅,并连带丢掉 skill 与 reference 的入口。
- **在 studio 框架中渲染右列。** 超出范围:studio 的三栏工作台没有它的位置,而且需求是隐藏这个控件,不是把右列做出来。

## Consequences

- 默认组合不变:ui-layout 的 AppFrame 声明 `rightbar`,展开按钮的行为与之前完全一致。
- 在 studio 中,ui-sidebar-files、ui-sidebar-documentpreview、ui-skill、ui-reference 保有各自的服务;它们向 `sidebar.right.pane.tab` 的贡献只是随席位一起等待。
- ui-sidebar-right 的 apply spec 覆盖了该门控(无声明则无控件;有声明则面板与控件一同注册),studio 启动 lane 继续证明 overlay 组合能够激活。
