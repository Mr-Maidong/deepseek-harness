# Agent Note: Typert 识别已安装包拥有的标注与边界类型

Status: implemented

[English](2026-10-02-typert-installed-package-ownership.md) | 中文

## Problem

工作区之外的包无法发布 [Typert Remote](../../../../docs/subsystems/typert.zh.md) 产物，因此外部插件若不在此工作区内保留一份孪生包，就无法构建。

识别逻辑绑定在生成器自己的注册集合上。`loadRegistrations()` 只保留 face 聚合通过 `projectReferences` 引用、且位于 `<root>/packages` 下的包，而 `isTypeMetaSymbol()` 仅在声明文件解析到名为 `@deepseek-ai/dsh-typert-protocol` 的注册项时才承认 `@Remote`、`TypertRemoteService` 与 `bindTypertRemote`。已安装依赖的声明解析自 `node_modules`，没有任何注册项覆盖它们，于是装饰器以及诸如来自 `@deepseek-ai/dsh-host-plugin-inventory/types` 的边界类型 `PluginEntryId` 都不被识别。`WorkspaceTypertGenerator` 随即以 `publishes Remote artifacts but has no Remote methods` 失败，从不产出 `lib/typert.remote-client.*`，该包的 `./remote` 导出对其 Client 程序也因此无法解析。

## Decision

声明归属按文件分两步判定：先取覆盖该文件的工作区注册项，否则——仅当文件位于 `node_modules` 内——取最近的祖先 `package.json`。该已安装查找按包根缓存，且 `node_modules` 之外的工作区目录永远不会成为归属方。

当归属清单为 `@deepseek-ai/dsh-typert-protocol` 时，`isTypeMetaSymbol()` 承认协议装饰器。Remote 边界路径——[`remoteBoundary()` 的导入遍历](../../../../packages/typert/generator/src/analyzer.ts)、`namedOwnedType()` 与 `publicRemoteType()`——接受任意归属包。工作区归属方仍通过 `sourcePathForExport()` 把导出目标解析到源码面，而已安装归属方直接采用其清单声明的目标（`lib/types/x.d.ts`），因为已安装包不附带 `src/`。边界类型必须来自公开非根类型子路径这一要求保持不变。

生成范围不受影响：`analyze()` 依旧只遍历 face 聚合引用的注册项，因此已安装包不贡献任何产物，生成的 Cordis 目录输出也不变。Vendor 目录下的代码同样不获得归属方，因为 [`installedPackageRoot()`](../../../../packages/typert/generator/src/analyzer.ts) 只接受包含 `node_modules` 路径段的路径。

## Alternatives considered

**要求插件保留一份仓库内包。** 这正是本次改动要消除的状态：从自有仓库发布的插件无法构建其 Remote 产物，而每个工作区包都要保留一份会漂移的插件源码副本。

**把协议声明 vendor 进插件。** Vendor 会复制装饰器签名以及可合并扩展的 `TypertRemoteMap`/`TypertRemoteNamespaceMap` 接口，插件的 Remote 命名空间便不再合并进 Host Gateway 所读的协议；来自其他依赖的边界类型也依然无法解析。

**接受任意最近的包清单，包括仓库目录。** 更宽的规则会让 `apps/`、`scripts/` 或 vendor 目录声称拥有某个声明，而生成器不应把这些视为包边界，识别范围也会远超所报告的故障。把回退限制在已安装路径上，可把影响面控制在编译器程序本就解析的依赖之内。

**仅按包名解析协议，不做清单上行查找。** 名称校验需要声明该名称的清单，因此这只是把上行查找换了个位置；它也无法服务边界路径，后者需要归属包的导出映射与根目录来构造导入说明符。

## Consequences

工作区之外的插件可按已发布的生成器布局构建：Remote 装饰器与依赖非根类型子路径导出的边界类型都能解析，`lib/typert.host.*` 与 `lib/typert.remote-client.*` 也会落到包输出根目录。

已发布生成器必须包含本次改动，外部插件才能直接从 npm 构建；在某个版本发布之前，这类插件需要链接本地工作区检出进行构建。若某已安装包的清单没有 `name`，其声明的边界类型将不被识别，而不会让分析失败。

验证位于 [`packages/typert/generator/tests/remote-model.spec.ts`](../../../../packages/typert/generator/tests/remote-model.spec.ts)：它复制 fixture，在副本的 `node_modules` 下安装协议包与边界类型包，并断言产出的 Remote JavaScript 与声明中对已安装包的导入。第三个用例固定“无名称的已安装清单不贡献导入”。前两个用例在旧的归属规则下失败。
