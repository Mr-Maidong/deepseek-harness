# Agent Note：iframe 预览卡片按 16:9 舞台自行决定高度

Status: implemented

[English](2026-09-15-studio-iframe-card-content-sized-stage.md) | 中文

## 问题

Studio 的万能预览卡片是一个悬浮外壳，承载两类内容。源文件撑满标题行与输入栏之间的对话列，这正适合编辑器：纵向空间越多，可见行数越多。渲染产物不需要这个盒子。内嵌的 HTML 文档按自身宽度的固定比例阅读效果最好，卡片也已经给它的 frame 设了 16:9 舞台——但包裹它的外壳仍然由 `top` 和 `bottom` 钉高决定，于是舞台停在全高卡片的顶部，下方留下一片空白。外壳的尺寸由产物根本用不上的几何决定。

同一个缺口也出现在读取状态里。卡片在文件读取落定之前就会发布 `loading`，而只有落定后的状态才携带按路径选出的 kind。对 HTML 文件的聊天文件手势把每个状态都发布成 `code`，因此卡片先以全高源码表面打开，读取落定后再跳成另一种形状。三个生产者各自独立判定渲染类型，而最新加入的那个根本没有判定。

## 决定

渲染产物的卡片现在由内容决定高度。`.preview[data-kind='iframe']` 放弃高度钉边：`top` 变为 `auto`，`bottom` 通过 CSS Anchor Positioning 直接读取输入栏自身的边缘（`anchor-name: --studio-composer` 声明在 `StudioFrame.module.css` 的 seat 上，消费方为 `position-anchor` 加 `bottom: calc(anchor(top) + 8px)`），于是卡片按内容定高并从这条固定的底边向上生长。这里显式写出 inset 属性而不交给 `position-area`，因为 `position-area` 设定的是元素的包含块，自动定位的盒子届时会在其中居中，而不是贴靠在锚点上。没有 `top` 钉高后，很高的草稿或很矮的视口会把卡片推过对话标题行，而不是把 16:9 舞台压变形；超出窗口的部分由 studio frame 裁掉。基础规则保留两条钉边，所以不支持 anchor positioning 的引擎退回原先那张舞台居顶的全高卡片。源文件不变：它依旧撑满整列。

kind 的判定由一个谓词负责。`previewKindFor(path)` 与 `isRenderedArtifact(path)` 位于 `frame/contract.ts`，即本包共享的 contract 层，文件树、头部搜索与聊天 opener 都经由它分类。每个生产者在读取开始前解析一次 kind，并把同一个 kind 贯穿 `loading`、`ready`、`error`，于是三种状态对卡片的尺寸完全一致，HTML 读取落定时不会改变卡片尺寸。渲染产物没有行网格，所以 focus 行号只传给源码缓冲区，内嵌文档也不带语言标签。loading 与 error 文案渲染在稍后被 frame 填充的同一块 16:9 舞台元素内。

## 考虑过的替代方案

**保留钉高，让 frame 拉伸填满外壳。** 已否决：这会恢复既有行为——HTML 文档被拉伸成对话列恰好剩下的任意比例，而这正是固定舞台存在的理由。

**用 JavaScript 依据实测舞台给外壳定高。** 已否决：该布局已经用 `ResizeObserver` 测量 composer seat，再为卡片自身高度加第二条测量循环，等于重复平台已声明式完成的工作，字号变化时会失效，还需要自己的销毁纪律。

**给 iframe 卡片设 `max-height`，溢出时压缩舞台。** 经确认后否决：被压缩的舞台会悄悄放弃卡片本应守住的比例，而它想保护的标题行只是稳定的界面构件，产物才是用户要求查看的内容。

**把共享谓词放进 `preview/` 域，再由其他生产者导入。** 已否决：`verify-client-domain-graph` 禁止兄弟域互相导入，而扩展名列表是关于 `StudioPreview` 自身的事实，它住在 `frame/contract.ts`。

## 后果

- 打开产出的 HTML 得到的是一张高度随宽度变化的紧凑卡片，而不是预览下方空着一片的全高外壳。
- 输入栏变高或窗口变矮时，卡片可能盖住对话标题行。这份重叠是守住比例的既定代价。
- 聊天中对 HTML 文件的手势现在渲染文档本身，而不是显示其源码，补上了聊天 opener 首次把会话点击接入万能卡片时留下的缺口。
- kind 选择只有一个归属，新增一种渲染扩展只需改一处；此前三分的重复实现确实已经出现漂移。
- 不支持 CSS Anchor Positioning 的引擎继续得到钉高的全高卡片。回退是一条 `@supports` 规则，不是第二套实现。
- 没有任何 locale key、store 字段、持久化格式版本或 session event 发生变化。

## 测试

`packages/client/ui-studio/tests/chat-file-opener.client.spec.ts` 新增三个用例：产出的 HTML 在每个状态都发布 `iframe` 且不带语言标签；工具行给出的 focus 行号对渲染产物会被丢弃；HTML 读取失败落在 iframe 错误卡片上。`packages/client/ui-studio/tests/preview-edit.client.spec.tsx` 新增两个：舞台在 `loading` → `ready` → `error` 之间于同一容器内保持其状态文案；iframe 卡片不接线编辑器，也不接线保存控件。既有的文件树与搜索断言仍逐个锁定每次发布状态的 `kind`。几何本身纯为 CSS，未做任何断言；jsdom 不上报 computed layout，因此视觉核对属于 `DSH_SNAPSHOT=replay pnpm run test:web`。
