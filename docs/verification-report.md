# 验证报告

验证日期：2026-07-29

## 环境

- Bun `1.3.14`
- TypeScript `7.0.2`
- Rsbuild `2.1.9`
- React `19.2.8`
- `@modelcontextprotocol/server` `2.0.0`

## 自动化门禁

`bun run acceptance` 已通过：

- 三个 workspace 的 TypeScript 7 类型检查。
- 11 项 Bun 单元/契约测试。
- Rsbuild 生产构建。
- modern-only HTTP acceptance。
- 4 项 Playwright 浏览器验收。
- 桌面 Chromium 与 390px Chromium。
- `orders.dashboard` 的 `_meta.ui.resourceUri`。
- `ui://mcp-v2/orders-dashboard.html` Resource 与
  `text/html;profile=mcp-app` MIME。
- sandbox MCP App JSON-RPC `postMessage` bridge、初始结果回流和组件内
  Tool 反向调用。
- JSON HTTP、legacy reject 和 no-SSE 断言。
- Codex-oriented MCP Client acceptance。

## 独立 Codex 会话

- 旧任务仅执行 `bun run acceptance:codex`，不是 Codex 直接调用 MCP
  Tool，也没有验证 App UI；该结果已作废。
- 重新新建的 Codex task `019fadc4-f5b7-7493-b2d4-304773a8d4aa`
  未发现 `mcp-v2-demo` 工具，因此 Tool 调用与任务内 App UI 均未通过。
- 另用全新 `codex exec` 进程验证，Codex 以 `2025-06-18` 发起握手，
  v2-only Server 正确拒绝并返回 `-32022 Unsupported protocol version`
  （Server 只支持 `2026-07-28`）。
- 为避免留下无法初始化的全局配置，验收后已移除
  `mcp-v2-demo` Codex MCP 配置。
- 当前不能把 Web Host 的 App UI 成功等同于 Codex 任务内 UI 成功。

### Codex 0.147 alpha 复测

- 独立 Codex CLI 已从 `0.145.0` 升级为 `0.147.0-alpha.1`，旧版安装目录
  保留，可通过切换 standalone `current` 链接回退。
- 已持久开启 `mcp_2026_07_28` 与 `enable_mcp_apps`。
- 已持久配置 `mcp-v2-demo` Streamable HTTP Server。
- 新版 CLI 成功使用 `2026-07-28` 发现并直接调用
  `orders.dashboard`，返回 3 条结构化订单数据；不再出现
  `Unsupported protocol version`。
- 当前运行中的 Codex Desktop 使用应用包内置旧后端，新建 task
  `019fadde-52d7-7670-b5d7-1443e92961ed` 仍未发现该工具，因此
  Desktop 内嵌 MCP App UI 尚未通过。
- 官方 `0.147.0-alpha.1` macOS DMG 经只读挂载核验，仅包含 Codex
  命令行二进制，不包含可独立升级的 Desktop GUI 应用。

`acceptance:codex` 仍会记录以下真实 Client 调用步骤：

1. `system.health`
2. `skills.discover`
3. `orders.search`
4. `skills.run`

记录只包含 Tool、脱敏 request id、耗时和状态，不包含 Token 或完整会话内容。

## 本地入口

- 验证中心：http://localhost:3000/
- MCP Server：http://localhost:3001/mcp
- 状态：http://localhost:3001/api/status

持久开发服务由当前 Codex task 启动；进程停止后可重新运行：

```bash
bun run dev:mcp
bun run dev:web
```

## 截图

- `artifacts/overview.png`
- `artifacts/mobile.png`
