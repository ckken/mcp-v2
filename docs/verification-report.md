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
- v2-first HTTP acceptance。
- 4 项 Playwright 浏览器验收。
- 桌面 Chromium 与 390px Chromium。
- `orders.dashboard` 的 `_meta.ui.resourceUri`。
- `ui://mcp-v2/orders-dashboard.html` Resource 与
  `text/html;profile=mcp-app` MIME。
- sandbox MCP App JSON-RPC `postMessage` bridge、初始结果回流和组件内
  Tool 反向调用。
- JSON HTTP、legacy stateless fallback 和 no-SSE 断言。
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

- 独立 Codex CLI 曾升级为 `0.147.0-alpha.1` 并完成纯 v2 调用验证；
  随后按兼容性复测要求回退到 `0.145.0`。
- `mcp_2026_07_28` 已关闭；`enable_mcp_apps` 保持开启以等待 Desktop
  重启后复测。
- 已持久配置 `mcp-v2-demo` Streamable HTTP Server。
- 新版 CLI 成功使用 `2026-07-28` 发现并直接调用
  `orders.dashboard`，返回 3 条结构化订单数据；不再出现
  `Unsupported protocol version`。
- 当前运行中的 Codex Desktop 使用应用包内置旧后端，新建 task
  `019fadde-52d7-7670-b5d7-1443e92961ed` 仍未发现该工具，因此
  Desktop 内嵌 MCP App UI 尚未通过。
- 官方 `0.147.0-alpha.1` macOS DMG 经只读挂载核验，仅包含 Codex
  命令行二进制，不包含可独立升级的 Desktop GUI 应用。

### Codex 0.145 兼容复测

- `@modelcontextprotocol/server-legacy` 经安装检查后已移除：它只提供冻结
  的 v1 SSE Transport 与旧 OAuth helpers，不负责 `2025-06-18`
  Streamable HTTP 兼容。
- Server 改用 `@modelcontextprotocol/server@2` 内置
  `legacy: "stateless"`；没有增加 SSE endpoint。
- SDK 集成验收同时通过现代 `2026-07-28` 与 legacy
  `2025-06-18` Client 的工具发现和 `orders.dashboard` 调用。
- 回退后的 Codex CLI `0.145.0` 成功发现并调用 `orders.dashboard`；
  Tool 结果携带 `ui.resourceUri`、`ui/resourceUri` 与
  `openai/outputTemplate`。
- Desktop task `019fade7-bf9e-7563-afe6-694cc6336f29` 成功调用 Tool
  并读取 `ui://mcp-v2/orders-dashboard.html`，但任务事件中没有
  App/widget 渲染事件；因此内嵌 UI 仍标记为未通过，不能用读取 HTML
  代替实际渲染。

### Skill 会话复测

- 使用回退后的 Codex CLI `0.145.0` 新建隔离会话，通过
  `2025-06-18` legacy stateless fallback 直接调用
  `skills.discover` 与 `skills.run`，没有使用 shell 代替 Tool 调用。
- 成功发现 `order-summary` 与 `verification-checklist` 两个 Skill。
- 成功执行 `order-summary`，输入演示订单 `ord_demo_1001`，返回
  `ord_demo_1001: paid`。
- 首轮调用因 Tool 缺少安全注解而被 Codex 自动审批取消；补齐只读、
  非破坏、闭合世界和幂等注解后复测通过。

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
