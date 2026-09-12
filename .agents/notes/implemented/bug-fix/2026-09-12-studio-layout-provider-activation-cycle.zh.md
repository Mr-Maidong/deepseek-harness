# Agent Note: studio 启动死锁——layout 提供者与其 uiWorkspace 注入

Status: implemented

[English](2026-09-12-studio-layout-provider-activation-cycle.md) | 中文

## Problem

在 ui-workspace 开始注入 `layout` 之后,`pnpm dsh web --patch packages/client/ui-studio/studio-suite.patch.yml` 启动失败,报 `web boot: 14 entries did not activate`。studio 组合禁用了 ui-layout,由 ui-studio 的 apply 提供替代的 `layout` 服务——但 ui-studio fiber 的 inject 列表等待 `uiWorkspace`,而 ui-workspace 只有在自己的 `layout` 注入解析后才提供它。两个 fiber 各自等待对方把守的服务,谁都无法激活,所有下游消费者(`uiConversation`、`sidebarRight`、`sidebarRightTabs`)都堵在这一对后面。

## Decision

把 `uiWorkspace` 从 ui-studio 的 fiber inject 列表中移除,改为在使用它的四个回调(`readFile`、`startSession`、`archiveSession`、`listDirectory`)内部通过 `ctx.get('uiWorkspace')` 解析。所有调用方都是激活后的 UI 手势,激活时不需要该服务;服务未被组合时解析器大声抛错。一般规则:从 apply 提供某服务的插件,不得让自己的 fiber 激活等待该服务的消费者。

## Alternatives considered

- **把 `layout` 的 provide 移进一个不注入任何服务的独立 studio entry。** 拒绝:这会为一个服务把同一个插件的装配拆到两个 bundle 行、两个 fiber 里;在现有 apply 内延迟解析能把装配保留在一处。
- **把 ui-workspace 的 `layout` 注入改为可选。** 拒绝:这是为一个 overlay 削弱已发布包的契约,而 studio 才是拥有替代提供者的一方。

## Consequences

- ui-studio 只依赖基础设施服务(`slots`、`theme`、`locale`、`sessions`、`workspaces`、`remote`、`remote.workspace`)即可激活,随后提供 `layout`,组合的其余部分随之激活。
- `apps/web/tests/studio-suite-boot.e2e.ts` 通过 studio overlay 启动真实构建的 bundle 并断言框架渲染成功,因此重新引入激活环会让该测试道失败,而不是让产品启动失败。assembled-boot 测试基建为此增加了组合额外 `--patch` 文件的 `overlays` 选项。
