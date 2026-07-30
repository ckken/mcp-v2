# 验证报告

验证日期：2026-07-30

## 环境

- Bun `1.3.14`
- TypeScript `7.0.2`
- Rsbuild `2.1.9`
- React `19.2.8`
- `@modelcontextprotocol/server` `2.0.0`

## 自动化门禁

`bun run acceptance` 已通过：

- 四个 workspace 的 TypeScript 7 类型检查。
- 15 项 Bun 单元/契约测试。
- Rsbuild 生产构建。
- v2-first HTTP acceptance。
- 6 项 Playwright 浏览器验收。
- 桌面 Chromium 与 390px Chromium。
- `orders.dashboard` 的 `_meta.ui.resourceUri`。
- `ui://mcp-v2/orders-dashboard.html` Resource 与
  `text/html;profile=mcp-app` MIME。
- sandbox MCP App JSON-RPC `postMessage` bridge、初始结果回流和组件内
  Tool 反向调用。
- shadcn/ui Dashboard 的 `overview | orders | status` 视图，以及
  `all | paid | pending | fulfilled` 状态筛选参数。
- 浏览器内实际执行 `view=orders, status=paid`，返回并渲染唯一匹配的
  `ord_demo_1001`，桌面与 390px 均通过。
- Streamable HTTP、modern JSON response、legacy stateless SSE 响应帧，
  以及无独立 SSE endpoint 断言。
- Codex-oriented MCP Client acceptance。

## 深度兼容审计结论

- modern Client 显式固定并实际协商到 `2026-07-28`；auto Client 在同时支持
  modern 与 legacy 时会优先选择 `2026-07-28`。
- legacy Client 同时通过 `supportedProtocolVersions` 与握手结果锁定
  `2025-06-18`。仅设置 `mode: "legacy"` 会跟随 SDK 默认顺序，当前会协商
  到 `2025-11-25`，不能作为 `2025-06-18` 兼容证据。
- 验收会采集 `/mcp` 的真实响应头：modern 成功结果为
  `application/json`，legacy stateless 成功结果包含
  `text/event-stream`；没有独立 SSE endpoint。
- Server 明确把 `tools.listChanged` 与 `resources.listChanged` 设为
  `false`，避免发现阶段广告未使用的订阅能力。
- 8 个 Tool 均有与行为一致的安全注解；6 个只读 Tool 明确声明只读、
  非破坏、闭合世界和幂等。
- 运行时八类能力中已实现 `tools/resources/skills/apps/verification`，
  尚未实现 `prompts/tasks/auth`。因此不能宣称完整覆盖 MCP v2 的全部能力。
- MCP App 宿主请求增加 10 秒超时和可见错误状态，宿主不响应时不再永久停留
  在 Connecting。
- 优化后使用本机 Codex CLI `0.145.0` 新建隔离会话
  `019fb0d1-7dd6-78b2-82b1-25db931e9c98`，直接调用
  `orders.dashboard(view=orders,status=paid)` 成功，Tool 事件返回
  `ord_demo_1001`，且原始 `_meta` 包含 `openai/outputTemplate`。CLI 的最终
  自然语言将该元数据误报为不存在，因此验收以原始 Tool 事件为准。
- 当前 Codex Desktop task 已能发现并直接调用 `orders.dashboard`，同样返回
  1 条 `ord_demo_1001`；本次调用没有向验收侧暴露 App/widget 渲染事件，
  因此 Tool 调用标记通过，Desktop 内嵌 UI 仍保持未验证。

### E2E Lab

- `POST /api/e2e/run` 真实建立 modern `2026-07-28` 与 legacy Client。
- 页面使用 `@xyflow/react` 将六个分组渲染为可缩放、可平移、可选择的
  Scenario Flow，E2E 页面不加载狐狸或其他品牌 IP 图片。
- 服务端返回真实报告后，20 个用例按原始顺序逐条经历 queued、running 和
  passed/failed；播放结束后才生成汇总结论。
- 20 个用例覆盖当前注册的 8 个 Tool、2 个应用层 Skill、验证成功/拒绝路径、
  Dashboard 三种视图和 MCP App Resource 契约。
- 最新报告可从 `GET /api/e2e/latest` 读取；页面不会补造成功结果。
- 桌面与 390px 浏览器均执行“运行全部 E2E”，验证 React Flow 画布、
  20 个用例的动效终态、场景切换和逐条证据，最终报告由服务端决定。
- MCP App sandbox 依次通过 `Overview → Orders → Status`，并验证
  `paid`、`fulfilled` 两次参数切换。

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
- `responseMode: "json"` 仅作用于 modern 请求；SDK 的 legacy
  stateless fallback 会在相同 `/mcp` POST 端点返回
  `text/event-stream` 响应帧。这不是独立 SSE endpoint，验收已分别锁定
  modern JSON 与 legacy SSE framing。
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

### 参数化 MCP App 复测

- 独立 Codex CLI 会话 `019fadfc-9740-7382-bbcd-afba5e1809a0`
  直接调用一次 `orders.dashboard`，参数为
  `{"view":"orders","status":"paid"}`。
- Tool 返回 `parameters.view=orders`、`parameters.status=paid`、1 条订单，
  首条订单为 `ord_demo_1001`，同时保留 `ui://` Resource 元数据。
- Web Host 将相同参数经 MCP Apps bridge 从 shadcn/ui 组件反向传给
  Tool，并在 iframe 内动态切换到筛选后的订单表格。
- Codex CLI 复测验证 Tool 与参数返回，不代表 Codex Desktop 已渲染
  App UI；Desktop 内嵌 UI 状态仍沿用前述结论。

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
- `artifacts/mcp-app-dashboard.png`
- `artifacts/mcp-app-dashboard-filtered.png`
- `artifacts/e2e-lab.png`
