# Agent Note: Studio 文件树展开状态持久化

Status: implemented

[English](2026-08-28-studio-file-tree-expansion-persistence.md) | 中文

## 问题

Studio 文件树把文件夹展开状态放在组件本地 `useState` 中，因此每次刷新页面都会收起所有目录并丢失已加载的子目录列表。用户每次回到同一工作区都要重新展开一遍。

## 曾考虑的替代方案

仅本地状态、不做持久化是现状，也正是缺陷本身。复用现有布局 store 的方案被否决：该 store 是为 frame 入口声明的，而文件树属于 `studio.workspace` 入口；跨入口共享 frame 持有的句柄会让两个注册耦合到同一个实例。

## 决策

文件树的展开状态成为 `studio.workspace` 入口声明的 root 作用域持久化 store（`createFileTreeStore`，key 为 `dsh.studio.file-tree-expanded.v1`）。它以 toggle 顺序保存 `expandedPaths: string[]`——JSON 可序列化的数组，因为 `Set` 无法通过 `attachPersistence` 的整值 JSON 写入持久化。`LeftPanelMain` 通过 `useStore` 读取路径、通过 `actions.toggleExpanded` 写入；`FileTree` 变为受控组件，通过普通 props 接收 `expandedPaths` 和 `onToggleExpanded`。子目录列表仍留在组件的 ref 缓存中（按路径为键），因此已加载的目录在重新展开时无需二次网络读取即可立即渲染。

## 结果

所有工作区的展开文件夹在刷新和重挂载后都会保留，因为路径是与工作区无关的绝对路径。文件树渲染保持纯净：所有可变的展开状态都流经已声明 store 的 actions。未来的 `Set` 形消费者必须在 store 边界转换为持久化的数组形态。

## 验证

Store 测试覆盖路径的展开/收起切换，以及从 `localStorage` 向新实例重新水合展开路径。组件测试通过回调驱动文件夹切换，并渲染 store 驱动的展开子项。ui-studio 测试套件、类型检查和构建全部通过。
