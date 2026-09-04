# Agent Note: 代码预览选中内容引用到对话输入框

Status: implemented

[English](2026-09-04-studio-code-preview-reference-insert.md) | 中文

## 问题

灵光代码预览卡片是只读的，用户在阅读源码时往往想把当前正在看的具体区域指给正在进行的对话，但唯一办法是手动把路径和行号重新敲进输入框。而对话本身已经支持 `@"path"` 形式的文件引用，所以预览卡片应当允许用户选中代码后，在一动之间把该文件连同选中行区间交给输入框。

## 决策

- **选中气泡**。在 `code` 类预览中选中文本会浮现一个小"引入"按钮，锚定在选中首行上方。只有当选中确实存在且发生在代码内容内部时（用 `window.getSelection()` 与代码元素的 `Range.getClientRects()` 校验）才显示；选中坍缩或移到卡片外时消失。
- **草稿引用格式**。点击按钮会把当前会话的输入框草稿替换为 `@"<path>" L<start>-L<end>`，其中路径用双引号包裹，格式与文件引用语法的带引号形式完全一致；区间是 1 起始、首尾闭合的选中行。示例：`@"src/a.ts" L10-L20`。该文本是机器可读的草稿格式而非 UI 文案，因此字面量内联保存。
- **装配与接线**。`PreviewCard` 增加一个可选的注入回调 `insertReference(text)`，`studio.center.editor` 槽注册从 apply 闭包提供它。由于编辑器席位是 root 作用域（其 inject 工厂不注入会话 id），回调在点击时用 `sessions.list.getSnapshot().current` 解析当前会话，再经注入的 `conversation` 服务到达输入框：`conversation.input.for(sessions.scope(current)).setDraft(text)`。
- 可选注入 prop 让现有 `PreviewCard` 调用点（测试与 frame）无需改也能编译；回调缺失气泡不产生面向产品的行为变化。

## Alternatives considered

**给编辑器注册注入会话 id。** 推迟：该席位声明为 `scope: 'root'`，其 inject 工厂拿不到会话参数；在点击时解析当前会话与该席位实际作用域一致，也无需改声明。

**把引用附加到既有草稿之后。** 否决：`SessionInput.setDraft` 会整体替换草稿并重新合并，这是程序化输入框写入的既定路径；需求是把引用放进输入框，而不是追加到进行中的草稿。

## Consequences

- 选中代码点"引入"即把 `@"path" L起始-L结束` 直接写入当前会话的输入框，随时可发送。
- 插入的草稿复用既有 `@"path"` 提及语法，因此对话的文件引用处理能识别带引号路径；行号后缀是该卡片自己的数据面扩展。
- 气泡只是代码表面上的视觉提示，不改变只读预览或文件树。
- 字典新增一对键（`preview.reference`：zh 引入 / en Insert reference）。

## Testing

`file-tree-preview.client.spec.tsx` 覆盖代码选中后气泡出现、组装的草稿 `@"/workspace/src/main.ts" L2-L3`、以及插入后气泡消失。`pnpm run test:gui` 保持绿色；两个无关的既有失败（`ui-chat/chat-stats`、`ui-trajectory/views` 的 tooltip 时机）不受影响。
