# Agent Note: 代码预览选中内容引用到对话输入框

Status: implemented

[English](2026-09-04-studio-code-preview-reference-insert.md) | 中文

## 问题

灵光代码预览卡片是只读的，用户在阅读源码时往往想把当前正在看的具体区域指给正在进行的对话，但唯一办法是手动把路径和行号重新敲进输入框。而对话本身已经支持 `@"path"` 形式的文件引用，所以预览卡片应当允许用户选中代码后，在一动之间把该文件连同选中行区间交给输入框。

## 决策

- **选中气泡**。在 `code` 类预览中选中文本会浮现一个小"引入"按钮，锚定在选中末行（光标所在的那一行）下方约 8px 处。锚点基于 `.codeWrap` 定位祖先的矩形计算（而非外层 `.preview` 卡片矩形，后者包含标题栏会导致气泡偏下）。只有当选中确实存在且发生在代码内容内部时（用 `window.getSelection()` 与代码元素的 `Range.getClientRects()` 校验）才显示；选中坍缩或移到卡片外时消失。
- **芯片 + 后缀插入**。点击按钮会在输入框光标处插入一个文件引用芯片（短文件名标签、`@"path"` 剪贴板文本、`appearance: 'file'`），后跟纯文本行区间后缀 `L<start>-L<end>`。芯片在输入框中渲染为标准 `@file` 标记样式，而非原始 `@"path"` 文本。`SessionInput` 契约新增 `insertReferenceAtCaret(ref, suffix?)`，内部解析光标 span 与版本号，先插入芯片加尾部空格，再追加后缀。
- **结构化回调**。`PreviewCard` 增加一个可选的注入回调 `insertReference(ref: CodeReference)`，接受 `{ path, startLine, endLine }`。`studio.center.editor` 槽注册构建 `ReferenceInsert`（`source: 'reference'`、`ref: @"path"`、`label: shortName`、`appearance: 'file'`、`clipboardText: @"path"`）并调用 `input.insertReferenceAtCaret(ref, suffix)`。由于编辑器席位是 root 作用域，回调在点击时用 `sessions.list.getSnapshot().current` 解析当前会话，并经 `ctx.get('conversation')` 到达输入框。
- 可选注入 prop 让现有 `PreviewCard` 调用点（测试与 frame）无需改也能编译；回调缺失气泡不产生面向产品的行为变化。

## Alternatives considered

**给编辑器注册注入会话 id。** 推迟：该席位声明为 `scope: 'root'`，其 inject 工厂拿不到会话参数；在点击时解析当前会话与该席位实际作用域一致，也无需改声明。

**用 `setDraft` 写纯文本配合扫描装饰。** 否决：把 `@"path"` 作为纯文本写入只有在词库匹配时才会产生芯片族装饰；真正的芯片需要 `insertReference` 配合 `ReferenceInsert`。芯片方案给出用户期望的标准短文件标记样式。

## Consequences

- 选中代码点"引入"即在当前会话输入框插入一个文件引用芯片（短文件名标记），后跟 `L起始-L结束`，随时可发送。
- 芯片在提交时经 `reference` 源编解码器序列化（与 `@file` 触发器选取路径一致），模型收到原始文件提及。
- 气泡基于 `.codeWrap` 坐标锚定，间距 8px，不受预览卡片标题栏高度影响。
- 气泡只是代码表面上的视觉提示，不改变只读预览或文件树。
- 字典新增一对键（`preview.reference`：zh 引入 / en Insert reference）。

## Testing

`file-tree-preview.client.spec.tsx` 覆盖代码选中后气泡出现（锚定在选中末行底部）、结构化回调接收 `{ path, startLine, endLine }`、以及插入后气泡消失。`pnpm run test:gui` 保持绿色；两个无关的既有失败（`ui-chat/chat-stats`、`ui-trajectory/views` 的 tooltip 时机）不受影响。
