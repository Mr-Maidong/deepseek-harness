# Agent Note：open-in-app 的解析固定它所依据的内核事实

Status: implemented

[English](2026-09-15-open-in-app-kernel-pinned-resolution.md) | 中文

## 问题

`canOpenNativePath` 在 Linux 上看到 `DISPLAY`、`WAYLAND_DISPLAY` 或 WSL 内核时，就认为该平台具备桌面能力；open-in-app 的解析器据此为 `requiresDesktop` 定位器把关，也就是 Linux 文件管理器（`xdg-open`）。内核之所以重要正是因为 WSL：它即使没有 X 或 Wayland 会话，也带着一个 Windows 桌面。

解析器调用 `canOpenNativePath` 时只传了 `platform` 和 `env`，内核一律来自运行代码那台机器的 `os.release()`，而 `OpenInAppInternals` 根本没有对应字段。于是一个 spec 即使固定了其他所有事实，在 WSL 主机上与在桌面 Linux 上仍会得到不同答案：`resolver.spec.ts` 的「没有桌面会话时不提供 Linux 文件管理器」期望在无显示变量的环境下返回 `null`，而在 WSL 上解析器反而给出了 `xdg-open`。兄弟包 `native-command` 早已在自己的 path-opener spec 中贯穿 `osRelease`，所以这处遗漏只属于本 seam。

## 决定

`OpenInAppInternals` 与 `ResolvedInternals` 携带 `osRelease`，在 `resolveInternals` 中与既有的 `platform` 默认值并列、一次性默认为 `os.release()`，并在这两个 native-path 调用点转发它——`requiresDesktop` 把关处与 `shell-open` 启动处。解析器现在依据交给它的事实判断 WSL，而不是依据它恰好运行在什么主机上。

`resolver.spec.ts` 在其共享的 `bare()` 基线中固定 `osRelease: '6.8.0-generic'`，因此每个用例都针对桌面 Linux 推理，与运行者的内核无关。`icons.spec.ts` 无需固定：它构造的是 launch 字面量，从不抵达解析器。

## 考虑过的替代方案

- **只在失败的那一个用例里固定内核。** 已否决：泄漏是该 seam 的属性而非某条断言的属性，此后任何解析 `requiresDesktop` 定位器的新用例都会继承同样的主机依赖。
- **只靠环境标记（`WSL_DISTRO_NAME`、`WSL_INTEROP`）判定 WSL 并去掉内核检查。** 已否决：这些变量在某些 WSL 环境下并不存在，而 `canOpenNativePath` 的内核检查正是 `native-command` 包已经依赖的权威。
- **在 spec 中把 `WSL_DISTRO_NAME` 设为空字符串来绕过标记检查。** 已否决：它绕不过内核检查，而且会让该 spec 去断言环境变量的传递细节，而不是它所测试的桌面会话规则。

## 后果

- 失败的用例在这台 WSL 主机上通过，并继续在桌面 Linux 上通过；测试套件不再随运行者的内核变化。
- 生产行为不变：`resolveInternals` 把新字段默认为被调方原本自行读取的同一个 `os.release()` 值，而 `shell-open` 启动现在显式收到它。
- 解析器测试现在可以把 WSL（`osRelease: '6.8.0-...-microsoft-standard-WSL2'`）表达为数据，而先前的接口做不到这一点。