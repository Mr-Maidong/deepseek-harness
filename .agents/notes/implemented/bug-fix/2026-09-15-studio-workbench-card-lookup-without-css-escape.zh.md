# Agent Note：工作台卡片查找不再依赖 CSS.escape

Status: implemented

[English](2026-09-15-studio-workbench-card-lookup-without-css-escape.md) | 中文

## 问题

展开一张待办卡片会安排一个 220 毫秒的定时器，把该卡片滚动到可见区域。定时器以 `article[data-todoid="${CSS.escape(todoId)}"]` 查找目标，而 jsdom 完全不含 `CSS` 命名空间，也就没有 `CSS.escape`。这个定时器还会活得比安排它的测试更久：等到它触发时，spec 的文档已被拆除，于是异常在测试已被报告之后才抛出，表现为 unhandled error 而不是测试失败。结果是所有测试都通过、`test:gui` 却仍以 1 退出——这比一条失败断言更糟，因为报告里没有任何地方指向原因。

## 决定

查找改为比较 dataset 值，而不是把 id 插值进属性选择器：`[...document.querySelectorAll<HTMLElement>('article[data-todoid]')].find(element => element.dataset.todoid === todoId)`。待办 id 作为数据比较无需转义，因此这段延迟代码不再依赖测试环境所缺少的浏览器 API。

## 考虑过的替代方案

- **在 spec 中给 `CSS.escape` 打补丁。** 已否决：本仓库没有其他 jsdom 缺口是用这种方式弥补的，而且全局补丁会掩盖一个事实——这条延迟路径在 jsdom 下根本无法运行。
- **保留选择器并在卸载时清除定时器。** 作为本缺陷的修法已否决（尽管它确实针对"定时器比组件活得久"）：它需要一个 effect 和一个 ref 来取消一个定时器，而该定时器在拆除后的运行如今已是无害的空操作，同时它把这个 jsdom 缺口留给下一次延迟查找。
- **不转义直接插值 id。** 已否决：id 是作为数据进入选择器的，而未转义的插值正是 `CSS.escape` 所要防止的隐患。

## 后果

- `test:gui` 以 0 退出且没有 unhandled error；测试套件不再报告与自身测试结果相矛盾的失败。
- 滚动路径本身在这条 lane 中仍未被测试：定时器活得比 spec 的文档更久，因此回调找不到卡片、在几何计算之前就返回了。要覆盖它需要假定时器与打桩的 rect，这属于推迟的工作，而不是保留该崩溃的理由。