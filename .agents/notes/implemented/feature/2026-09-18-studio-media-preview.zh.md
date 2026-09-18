# Agent Note: Studio 预览卡片播放工作区媒体并拒绝二进制文件

Status: implemented

[English](2026-09-18-studio-media-preview.md) | 中文

## 问题

Studio 的万能预览卡片把每个路径都分类为 `code` 或 `iframe`（[卡片决定](2026-09-03-studio-universal-preview-card.zh.md)）。因此工作区里的图片或视频没有自己的展示面：点击后走的是有界文本读取，而它只接受自身字节上限内的 UTF-8 文本，于是图片要么带着替换字符被当成源码显示，要么因体积失败，产出的视频则完全无法在卡片中观看。

同一次读取对工作区其余二进制文件同样不合适。压缩包、PDF、字体或音频都不是文本，而读取要么显示乱码，要么在把上限之内的字节拉过网络之后拒绝该文件。卡片需要说明它无法展示什么，并且在读取之前就做出这个判断。

## 决定

分类由 `frame/contract.ts` 拥有，发布链路由 `preview/open-preview.ts` 拥有，三个生产者——文件树、头部搜索与聊天 opener——都调用它，取代了它们各自那份相同的「读取并发布」序列。

- `mediaFileType(path)` 把扩展名映射为 `{ kind: 'image' | 'video', mediaType }`。表中收录浏览器能解码或播放的格式：`png jpg jpeg gif webp avif bmp ico svg` 与 `mp4 m4v mov webm mkv`。SVG 在此算图片，与侧边栏文档预览一致，因此它只以 `img` 元素的 blob URL 抵达浏览器，其中的脚本永不运行。
- `isUnsupportedBinary(path)` 覆盖没有展示面的格式：压缩包与打包文件、可执行与目标文件、PDF 与 Office 文档、字体、音频，以及浏览器解码器不接受的图像与视频容器。`ts`、`rtf` 与有歧义的 `dat`/`img` 后缀不在其中，因为源码缓冲区比一次拒绝是更好的预览。
- `previewKindFor(path)` 先回答媒体，再回答 `'binary'`，最后用 `textPreviewKindFor(path)` 回答可读 kind。媒体路径只发布一个携带路径与媒体类型的 `ready` 状态，生产者从不读取它；被拒绝的二进制发布一个 kind 为 `'binary'` 的 `error` 状态；可读 kind 保持 `loading → ready/error` 流程，且只有源码携带 `focus`。

媒体字节由卡片自己读取。`preview/media-face.ts` 基于 `workspaceFiles.readAll` 构建 `loadMedia`，即编辑缓冲区已经在用的同一个 Remote，因为这些字节绝不能进入框架持久化的预览 store：该 store 是一份 `localStorage` JSON 文档（`dsh.studio.layout.v1`），一张图片就会耗尽配额，并连带毁掉卡片的几何信息。store 只保留路径与媒体类型。卡片用一个 `blob:` URL 播放这些字节，在路径改变或卡片卸载时撤销该 URL；渲染为 `<img>` 或 `<video controls playsInline preload="metadata">`，而卡片已经离开的那次读取既不会写入状态也不会创建 URL。`preview/session-selection.ts` 持有两个卡片面共用的会话解析，因此从浏览器存储恢复的媒体卡片会等待会话列表，而不是报告失败。

若一次文本读取在两个表都不认识的扩展名下解码出非法字节（`\uFFFD`），它会改判为二进制拒绝，而不是显示乱码；事先不读字节正是这一检查代价很低的原因，这也是表未收录扩展名下唯一可用的检测手段。

拒绝与媒体失败都留在卡片本地。生产者正常 resolve，因此聊天视图的打开失败对话框对它们保持关闭，卡片则显示 `preview.binaryUnsupported`、针对 `workspace-file/too-large` 的 `preview.mediaTooLarge`，或 `preview.mediaFailed`；编辑冲突早已使用的重新加载控件就是媒体的重试入口。`preview.image` 与 `preview.video` 命名区域，图片的 alt 文本则点出文件名。

## 考虑过的替代方案

**只加媒体，不处理其他二进制格式。** 否决：乱码源码与超大读取对每一种二进制格式都是同一个缺口，而媒体需要的扩展名表本就能区分它们。

**通过 Host 的 `/api/file` HTTP 路由提供媒体。** 否决：它按图片字节上限提供，不支持 range 请求（播放器反正要取回整个文件），需要 http(s) 页面（Electron 的 `file://` 没有），并且绕过了 README 承诺的 Host/Remote 读取契约所包含的会话工作区解析。

**把媒体字节或其 blob URL 放进预览 store。** 否决：该 store 是一份持久化 JSON 文档，字节会撑爆配额，而 blob URL 也活不过一次刷新。

**让每个生产者各自读取字节并发布。** 否决：三个生产者会重复这次读取，而这个会被持久化的发布只是把配额失败提前了一步。

**对每个路径都先读字节做嗅探。** 否决：文本预览有上限是有原因的，把它们改成整文件字节读取会把大源码文件拉过网络，并丢掉工作区服务推导出的语言标签。普通读取之后再做 `\uFFFD` 检查，可以免费覆盖未知扩展名。

**在同一次改动里一并解码音频。** 延期：`mp3`、`wav` 等在卡片拥有对应播放面之前留在拒绝表中。

## 后果

- 点击图片或视频打开只读播放器：图片只缩小不放大，视频内联播放并带控件，两者都会在卡片切换时被撤销。SVG 失去就地编辑能力，这是渲染它的代价。
- 媒体整体读取，受 Host 的整文件上限约束而非流式或 range 请求，浏览器同时持有 base64 文本、解码后的字节与 blob。超过上限的文件会如实报告，并提供一个不可能成功的重试。
- 二进制格式在任何读取之前就被拒绝，因此没有字节流动，也不会出现乱码；两个表都不认识的扩展名仍要付出一次有界文本读取才被拒绝。
- `StudioPreview` 的 ready 状态现在有三个成员（`code`、`iframe` 与媒体那一对），`kind` 增加了三个取值。
- 插槽、store 字段、持久化版本与会话事件都没有变化，预览 store 增加的是路径与媒体类型，而不是字节。
- 媒体与二进制拒绝的聊天手势正常 resolve 而非 reject，因此它们的失败出现在卡片上，而不是聊天打开失败对话框里。
- 文件树与搜索不再各自持有「读取并发布」的副本；共享链路只有一份实现和一份用例。

## 测试

`preview-kind.client.spec.ts` 固定分类、刻意保留为文本的后缀，以及媒体表与拒绝表互不相交。`preview-media-face.client.spec.ts` 覆盖解码、上限原因、其他拒绝、会话列表 pending，以及列表已到但无选中会话。`preview-media.client.spec.tsx` 覆盖 blob URL 生命周期（创建、换路径时撤销、卸载时撤销、晚到的读取不创建 URL）、重试、读取 reject、卡片已经离开的读取被拒绝、元素无法解码、未接线媒体面、永不 resolve 的媒体路径，以及二进制拒绝。聊天 opener、文件树与头部搜索的用例断言媒体或拒绝路径只发布一个状态且从不调用文本读取；`preview-edit-face.client.spec.ts` 继续覆盖共享的会话解析。`pnpm exec vitest run packages/client/ui-studio` 通过，且本包覆盖率通道中每个改动过的源文件都是 100%。
