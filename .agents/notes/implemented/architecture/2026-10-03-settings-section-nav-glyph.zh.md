# Agent Note: 设置导航图标走 slot，而非外壳自持的 id 映射

Status: implemented

[English](2026-10-03-settings-section-nav-glyph.md) | 中文

## Problem

设置导航每一行的图标都取自 ui-settings-general 内部的私有 `navIcon(id)` 映射，因此由本工作区之外的插件贡献的分区只能继承兜底的齿轮图标；要让它拥有自己的图形，就得在仓库源码里写死一个本仓库并不发布的包的 id。导航单元格属于外壳（`sidebar.settings` 的占位方）而不属于分区，因此分区自身的注册没有可绘制的渲染位置，ReactNode 也无法经 `settings.section` 的属主 props 或其 inject 面到达那里。

## Decision

`settings.section.icon` 是由外壳 `sidebar.settings` 注册声明的 root 作用域 `list` slot，其类型与其余设置 slot 类型一起放在 [`ui-settings/src/client/contract/slots.ts`](../../../../packages/client/ui-settings/src/client/contract/slots.ts)。贡献按注册 id 定位一个导航行：id 等于它要绘制的分区 id；该 slot 自身不接受属主 props，因为图形不需要外壳知道的任何数据。

外壳逐行通过 `renderSlot('settings.section.icon', {}, { only: row.id })` 渲染该 slot，外层是携带 `.navIcon` 盒子的外壳自有 `span`，于是单元格保留图标几何，`currentColor` 继承导航单元格的文字颜色。随附图标以 16×16、`currentColor` 绘制，贡献不带任何文案，尺寸与之一致。

外壳保留 `navIcon(id)` 作为所有没有贡献的行的兜底，因此本仓库随附的分区（`account`、`models`、`agent-presets`、`plugins`、`archived-sessions`，以及其余 id 的设置齿轮）绘制的图形与从前一致，不贡献图形的分区也仍然有可用的图标。

[`ui-settings-general/src/client/index.ts`](../../../../packages/client/ui-settings-general/src/client/index.ts) 中的投影把该事实作为 `SettingsSectionRow.hasIcon` 报在每一行上，并让图标账本成为分区账本与 locale revision 之外的第三个缓存键与订阅来源。因此插件一经注册，对应行就换上贡献的图标，而组件收到的仍是普通投影行，无需自行订阅账本。

插件通过 `ctx.slots.inject('settings.section.icon', …)` 贡献图形，因此针对尚未声明该 slot 的外壳组合的插件会保持挂起而不会加载失败，其贡献随该声明一并撤除。

## Alternatives considered

**在外壳的 `navIcon` 映射里写死分区 id。** 这会让外壳携带一个它并不发布的插件的 id 与图形，每新增一个外部区块都要改动外壳并重新构建已发布的 App。

**把图形做成 `settings.section` 注册上的字段。** 属主 props、注入值与 store 状态接受 JSON 兼容的数据与回调；注册的 ReactNode 内容只能走 slot，因此该字段至多持有组件引用——它既不是被允许的值，也不由渲染器组合。

**用 `single` slot 持有当前行的图形。** 导航同时渲染所有行，而 `single` slot 只有一个占位方，因此它只能服务当前分区。

**声明以分区 id 作为 `entryKey` 的 `keyed` slot。** 寻址能力等价，但多引入一套键命名空间；在同一渲染点，`settings.section` 已经使用 `list` 基数加 `only` 过滤。

**让每个分区自行声明图形 slot。** slot 只在其声明条目渲染它的位置渲染，而分区的注册并不渲染导航单元格；逐分区声明还会让外壳那一处渲染点对其他分区而言变成未声明。

**把仓库内分区改为贡献并删除 `navIcon`。** 这会把 ui-primitives 导入与不含文案的图形搬出外壳，却没有任何消费方收益，而且此后没有贡献的分区将完全没有图标。

## Consequences

任何 Client 插件都能为自己的设置分区组合出导航图标，无需改动外壳，外壳也不再持有任何插件 id 或图形。id 不与任何已注册分区匹配的贡献是惰性的，因为没有行携带该 id。

生成的 Client slot 目录（`pnpm run gen-client-catalog`）为插件作者列出该 slot，[`docs/subsystems/slots.zh.md`](../../../../docs/subsystems/slots.zh.md) 的 slot 树也收录它。

验证：[`settings-root.client.spec.tsx`](../../../../packages/client/ui-settings-general/tests/settings-root.client.spec.tsx) 渲染有贡献与无贡献的行，并断言有贡献的行绘制该贡献且不含内置 `svg`；[`shell.client.spec.ts`](../../../../packages/client/ui-settings-general/tests/shell.client.spec.ts) 断言子声明、图标账本上的 `hasIcon` 投影，以及快照稳定性约定。
