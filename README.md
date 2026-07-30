<p align="center">
  <img src="./assets/mcp-v2-lab-cover.png" alt="MCP V2 Fox Trail：Kenvo 狐狸巡检 Protocol、Apps、Skills 与 Codex" width="100%" />
</p>

# MCP v2 实验场

这是个能直接跑起来的 MCP v2 实验仓库。协议、MCP App、Skills 和 Codex
会话被放进同一条验证链路。哪些已经可用，哪些还卡在客户端，都直接写在下面。

## 实验内容

| 实验 | 做法 | 当前结果 |
| --- | --- | --- |
| MCP v2 Server | `@modelcontextprotocol/server@2.0.0`，协议版本 `2026-07-28` | 已通过 |
| Streamable HTTP | modern 使用 JSON；legacy stateless 使用同端点 SSE 响应帧 | 已通过 |
| 旧 Codex 兼容 | v2 内置 `legacy: "stateless"`，不安装 `server-legacy` | Codex CLI `0.145.0` 可调用 |
| Skills | `skills.discover`、`skills.run` | 真实 Codex 会话已通过 |
| MCP App | `ui://` Resource、sandbox、JSON-RPC bridge | Web Host 已通过；Desktop 内嵌 UI 未验收通过 |
| 参数化 Dashboard | `view`、`status`、`query` 驱动 shadcn/ui 界面 | 桌面浏览器与 390px 已通过 |
| Codex 会话验收 | CLI 与当前 Desktop task 直接调用 Tool | 已通过 |
| Prompts | 2 个原生 MCP Prompt，modern 与 legacy 均可发现和渲染 | 通过 |
| Tasks | 5 个应用级 Task Tool，覆盖创建、轮询、列表、取消和结果 | 通过 |
| Auth | 可配置 Bearer Token + scope，覆盖 401/403/授权调用 | 通过 |
| v2 动态发现 | cache hints、完整 JSON Schema、Trace Context、`input_required` | 通过 |
| 独立场景闭环 | 6 个 React Flow 动画工作流，入口参数改变真实运行路径 | 6/6 |
| 服务端 E2E | modern + legacy 的 25 个自动化用例 | 25/25 |

这里的 legacy SSE 仅指 `2025-06-18` stateless POST 响应的
`text/event-stream` 封装；项目没有旧式独立 SSE endpoint，也没有实现
`subscriptions/listen`。`responseMode: "json"` 只约束 `2026-07-28`
modern 请求，不能据此宣称所有兼容请求都是 JSON 响应。

当前项目定义的八类运行时能力均已实现。Skills 是 Tool 组合出的应用层能力；
Tasks 也采用 `tasks.*` Tool 模型，因为当前 `2026-07-28` SDK 已不提供旧版
原生 Tasks 运行时。Auth 在设置 `MCP_AUTH_TOKEN` 后启用；未设置时保留本地
免鉴权开发模式。

## 场景化验证中心

验证中心不再用六套特征卡和证据卡重复解释 v2，而是直接进入一个 React Flow
主闭环：动态发现 → 协议 → 工具 → 技能 → MCP 应用 → Codex 会话 → Verdict
回流。左侧六个入口只定位主 Flow 节点，不切换页面；“运行完整闭环”按顺序
调用六条真实服务端路线，节点状态和底部证据条只投影服务端报告。老版本切换
只改变 Flow 结构并明确标记为概念对照，不发送请求。

服务端仍保留六个相互隔离的动态入口和 latest report 槽位；主 Flow 只是前端
编排，不会把多个场景合并成一份伪造结论。服务端的 25 个自动化用例继续作为
独立门禁执行。

`orders.dashboard` 是这里最直观的实验。它返回一个 React + shadcn/ui
Dashboard，组件里的 Tabs 和 Select 会再次调用 Tool，拿到新的
`structuredContent` 后切换视图。

```json
{
  "view": "orders",
  "status": "paid"
}
```

这组参数会返回一条演示订单 `ord_demo_1001`。Codex CLI 能拿到结果；
当前 Codex Desktop 还没有把 MCP App 真正渲染到会话里。主 Flow 验证
Tool、`ui://` Resource、bridge 与 render 的服务端路线证据；MCP App 自身仍
单独构建和测试，但当前精简后的验证中心不再嵌入 iframe Widget。

## 运行

```bash
bun install
bun run dev
```

- 验证中心：<http://localhost:3000/>
- MCP Server：<http://localhost:3001/mcp>

生产容器把构建后的验证中心、`/api` 和 `/mcp` 统一暴露在 `3000` 端口：

```bash
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
```

生产入口：<https://mcp-v2.kenvoai.com/>，MCP Endpoint：
<https://mcp-v2.kenvoai.com/mcp>。容器以非 root、只读文件系统运行，并通过
共享 `edge` 网络交给 Caddy 终止 TLS。

完整验收：

```bash
bun run acceptance
```

它会执行 TypeScript 7 类型检查、Bun 测试、Rsbuild 构建、HTTP
验收、Playwright 桌面与移动端验收，以及面向 Codex 的客户端调用链。

## 目录

```text
apps/mcp-app   shadcn/ui MCP App，构建为单文件 HTML
apps/web       单主场景 React Flow 验证中心
services/mcp   Bun MCP Server、Tool、Resource 和验收脚本
packages/shared
               共享契约与测试夹具
```

详细结果见 [验证报告](./docs/verification-report.md)。本轮用例范围和完成边界
记录在 [E2E 验收规划](./docs/e2e-acceptance-plan.md)。
