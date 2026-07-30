# MCP v2 可视化验证 Demo 实施计划

## 目标

使用 Bun workspace 和 Bun 包管理，从零实现一个只支持 MCP `2026-07-28`
modern era 的可视化 Demo。服务端以 v2 内置 stateless fallback 兼容
2025-era Streamable HTTP Client。modern 请求固定返回 JSON；legacy
stateless POST 结果使用 SDK 的 SSE 响应帧，但不提供独立 legacy SSE
端点，也不实现 `subscriptions/listen`。前端使用 Rsbuild 2、React 19 和
TypeScript 7。

第一交付优先级是：

1. 可运行的前端验证中心。
2. 可重复的会话验收协议。
3. 一个真实新建 Codex 会话完成 MCP 工具调用验收。

## 技术边界

- 包管理、workspace、脚本和脚手架统一使用 Bun；不使用 npm、pnpm、yarn 或 npx。
- MCP 依赖只使用 `@modelcontextprotocol/*@2`，不安装 v1
  `@modelcontextprotocol/sdk` 或 `server-legacy`。
- v2 Client 固定 `2026-07-28`；Server 使用 `legacy: "stateless"`，
  并以 `2025-06-18` Client 做独立兼容验收。
- modern Demo MCP 结果使用 JSON；验收必须断言 modern 路径未出现
  `text/event-stream`，并独立断言 legacy stateless 路径真实经过 SSE
  响应帧。
- MCP Apps 使用 `ui://` Resource、sandbox iframe 和最小
  `postMessage` bridge；在官方 helper 兼容 v2 前不引入其 v1 peer。
- Skills 是应用层能力模型，由 Resource、Prompt、Tool、Workflow 和
  `inputRequired` 组合，不宣称为 MCP 核心原生对象。
- Prompts 使用 MCP 原生 `prompts/list` 与 `prompts/get`。
- Tasks 通过 `tasks.*` 应用级 Tool 演示创建、轮询、列表、取消和结果；
  不伪装成当前 SDK 已移除的旧版原生 Tasks。
- Auth 使用可配置 Bearer Token 与 scope；本地默认关闭，设置
  `MCP_AUTH_TOKEN` 后启用。
- `server/discover`、`tools/list`、`prompts/list`、`resources/list/read`
  返回明确的 `ttlMs/cacheScope`；Tool 暴露并校验 `outputSchema`。
- 请求使用 W3C `traceparent`，`verification.finish` 通过
  `input_required` + HMAC `requestState` 完成人工确认重入。
- 每个场景的入口契约从实时发现生成，前端只提交有界参数；服务端返回实际
  `route`，React Flow 不假设固定五步。

## Workspace

```text
apps/web          Rsbuild React 验证中心和 MCP App UI
services/mcp      Bun MCP v2 Server、验证运行器和内存业务模型
packages/shared   共享 DTO、Schema 和验收状态
tests/e2e         真实浏览器验收
```

## 可视化验证中心

前端必须由真实请求驱动，不允许硬编码通过状态。界面使用一个 React Flow
动态路由器，根据实时入口条件渲染六条相互隔离路线中的当前命中路线：

| 场景 | 独立闭环 |
| --- | --- |
| 00 闭环实验 | status → registry → catalogs → matrix → verdict → Ready，只检查自身且不触发其他场景 |
| 01 协议 | 根据 auto/modern/legacy 选择自包含 Modern 请求和/或 Legacy 兼容连接 → framing → boundary → verdict → Entry |
| 02 工具 | discovery → schema/annotations → selected call → optional application Tasks → verdict → Entry |
| 03 技能 | Prompts → discovery → execution → input/error → verdict → Ready |
| 04 MCP 应用 | metadata → Resource → bridge → render → verdict → Ready |
| 05 Codex 会话 | start → calls → evidence → confirm → verdict → Ready |

六条服务端路线拥有独立动态入口、运行状态和最新报告。左侧选择运行面，
上方入口字段展示 protocol、selection 与 parameters 的 IF 条件，画布只渲染
命中的步骤；条件变化后旧证据不再投影。老版本/v2 切换直接更换节点和边，
老版本概念对照不发送请求且运行按钮保持禁用。

## Codex 会话验收协议

服务端注册：

- `verification.start`
- `verification.status`
- `verification.finish`

`verification.start` 创建 `runId`。Codex 必须在同一真实会话中依次完成健康
检查、Skill 发现、订单查询、Skill 执行和人工确认。服务端根据审计记录判定
结果，客户端不能直接写入成功状态。

只保存脱敏证据：client info、协议版本、Tool、request id、状态、耗时和
是否经过确认。不得保存 Token、完整对话或私有配置。

## 验收门禁

```text
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run acceptance:http
bun run acceptance:browser
bun run acceptance:codex
bun run acceptance
```

最终必须同时满足：

- TypeScript 7 类型检查通过。
- Rsbuild 生产构建通过。
- MCP HTTP 集成验证通过。
- 浏览器可视化验证通过。
- v2 `2026-07-28` 与 legacy `2025-06-18` stateless 验收均通过。
- modern MCP 结果均非 SSE；legacy stateless SSE 响应帧已独立验证。
- MCP App iframe bridge 通过。
- 新建 Codex 会话调用链通过。

## 实施顺序

1. 建立 Bun workspace、共享类型和统一脚本。
2. 完成 Rsbuild React 验证中心的可用界面与本地状态模型。
3. 完成最小 MCP v2 Server 和 HTTP 验收。
4. 接入真实 Tool、Resource、Prompt、Skills、Auth、Apps 和 Tasks。
5. 完成浏览器自动化验收。
6. 新建 Codex 会话，连接本地 Server，完成 `verification.finish`。
7. 将脱敏结果回显到前端 Codex Session 页面。
