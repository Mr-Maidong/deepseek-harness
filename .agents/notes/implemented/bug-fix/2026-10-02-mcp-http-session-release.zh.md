# Agent Note: 连接被放弃时释放 MCP HTTP 会话

Status: implemented

[English](2026-10-02-mcp-http-session-release.md) | 中文

## Problem

用户配置的一个有状态 Streamable HTTP 服务器接受了首次连接，而在配置项被禁用再重新启用后，每次尝试都以 HTTP 500 `Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.` 失败。客户端会原样上报响应体，因此该配置项的错误就是这段服务器文本，而不是一个可诊断的连接失败。

插件从未释放自己开启的会话，而 MCP SDK 也不会自行释放：传输的 `close()` 会中止进行中的请求并触发 `onclose`，而结束服务器端会话是规范另行定义的 `terminateSession()` 操作，即携带会话头的 HTTP `DELETE`。一次只服务一个会话的服务器会把单个 Protocol 实例绑定到它正在服务的会话上，并拒绝下一次握手，直到该会话结束。监督器会关闭每一个被放弃的世代——dispose 时、替换连接时以及尝试失败时——因此这些路径都泄漏了自身开启的会话。

## Decision

关闭世代时，会先释放它开启的服务器会话，再关闭传输。该顺序是必须的，而非风格选择：终止请求携带的正是 `close()` 所中止的同一个中止信号，因此先关闭再释放会在每条路径上都失败。释放成功时 SDK 会清除其会话 id，这使得 stuck-close 屏障的重复关闭成为空操作，而不会变成重复请求。

传输模块通过一个导出的 `terminateSession(transport)` 拥有这项传输相关知识，它只对 Streamable HTTP 传输生效，对 stdio、内存传输以及在构建传输之前就失败的尝试直接返回。监督器从关闭世代的唯一函数中调用它，因此不存在会跳过它的第二条关闭路径。

该释放是尽力而为的。SDK 已经接受 `405 Method Not Allowed` 表示服务器不终止会话，其余任何失败都会记为 `could not release the server session`，且不会让 dispose 失败。所有调用方到达该关闭点时，世代的丢失信号都已解除武装——dispose、已定局的尝试，或已处理的一次丢失——因此被拒绝的释放不会启动重连循环，本次修复也无需新增生命周期状态。

## Alternatives considered

**把会话留给服务器自行过期。** 这是先前的行为。它假定服务器最终会丢弃空闲会话，但所报告的服务器并不会：该配置项在服务器进程重启之前一直不可用，而该失败看起来像服务器端缺陷。

**先关闭传输再释放。** `close()` 会中止释放请求所传入信号的那个控制器，因此释放会在每条路径上被中止而不是被发出。

**由监督器直接发送 `DELETE`，而不调用 SDK 操作。** 这会重复 SDK 的请求头与协议版本处理、对 `405` 的容忍以及会话 id 记录，并让监督器耦合到某一种传输的线上格式。

**记录世代是否已释放。** 成功时 SDK 会清除其会话 id，因此重复释放本就是空操作；再加一个标志会为一个传输已经持有的事实引入独立所有者。

**释放失败时让 dispose 失败。** 拒绝终止是客户端权限之外的事，而卸载仍必须完成。该警告让泄漏在日志中可见，而不是藏在一个失败的卸载之后。

## Consequences

被禁用再重新启用的配置项，能对一次只服务一个会话的服务器重新连接；替换世代的重新连接也会释放前一个世代持有的服务器会话，因此这类服务器能在中断后继续可用。拒绝终止的服务器会保留被放弃的会话直到其自行过期；插件会记录该释放失败并继续运行，因此下一次握手仍可能被拒绝，重启服务器即可清除。

验证：`packages/mcp/mcp-client/tests/http-session.spec.ts` 运行一个一次只服务一个会话的有状态 fixture，并复现所报告的 500 响应体，覆盖 dispose 时观察到释放、替换连接达到 `connected` 且其工具可正常调用、失败的世代在重连前完成释放、`405` 拒绝保持静默，以及释放失败只记为警告而不让 dispose 失败。`packages/mcp/mcp-client/tests/mcp-client.spec.ts` 覆盖 `terminateSession` 对不持有会话的传输、从未获得会话的会话型传输，以及没有传输的失败尝试。本次修复所依托的关闭与丢失归属见[重连 Agent Note](2026-10-02-mcp-reconnect-past-the-budget.zh.md)与[包 README](../../../../packages/mcp/mcp-client/README.zh.md)。
