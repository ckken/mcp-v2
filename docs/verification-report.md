# MCP v2 兼容性验证报告

验证日期：2026-07-30

## 1. 最终结论

| 维度 | 结果 | 支持程度 | 结论边界 |
| --- | --- | ---: | --- |
| 项目规划能力 | 通过 | 8/8（100%） | Tools、Resources、Prompts、Skills、Apps、Tasks、Auth、Verification 均已实现 |
| 自动化 E2E | 通过 | 25/25（100%） | modern、legacy、Prompt、Tool、Task、Skill、Verification、MCP App |
| Modern MCP | 通过 | 当前用例 100% | pinned/auto 协商 `2026-07-28`，成功响应为 JSON |
| v2 新特征 | 通过 | 本项目选定范围 5/5 | cache hints、JSON Schema 2020-12/outputSchema、Trace Context、`input_required`、Extensions |
| Legacy Codex 兼容 | 通过 | 当前用例 100% | `2025-06-18` stateless fallback，结果使用 SSE 响应帧 |
| Web 主 Flow | 通过 | desktop + 390px，10/10 | 单画布、六路线、老版概念切换、动态 Tool 路由 |
| 独立场景闭环 | 通过 | 6/6（100%） | Scene 00–05 入口动态发现，参数改变实际路线，报告与运行状态隔离 |
| Auth 基线 | 通过 | Demo/内网基线 | Bearer Token、scope、401、403、授权调用；不等同完整 OAuth/OIDC |
| Codex Desktop 内嵌 UI | 未验证 | 不计入通过 | Tool 可调用，但尚无可确认的 widget 渲染证据 |
| 公网部署 | 通过 | 单实例 Demo | Docker + TLS 域名可运行；仍不等于生产级治理完成 |

| 问题 | 最终回答 |
| --- | --- |
| 当前项目能否兼容 v2 正常运行？ | 能。`2026-07-28` modern Client、auto negotiation 和 `2025-06-18` legacy Client 均已通过真实 HTTP 调用。 |
| 之前未实现的 v2 缺口是否已补齐？ | 已补齐动态发现入口、缓存提示、完整输入/输出 Schema、Trace Context 和多轮人工确认。 |
| 是否等于 MCP v2 全规范 100%？ | 不等于。这里的 100% 是本项目定义的 8 类能力与 25 个用例，不代表所有可选扩展。 |
| 是否可直接公网生产？ | 不建议。协议兼容与功能 Demo 已完成，生产工程仍需补强。 |

## 2. 能力支持矩阵

| 能力 | 实现 | 兼容方式 | 验收结果 |
| --- | --- | --- | --- |
| Tools | 13 个 MCP Tool | modern + legacy | 13/13 可发现；读写安全注解已校验 |
| Resources | `ui://mcp-v2/orders-dashboard.html` | 原生 list/read | URI、MIME、单文件内容通过 |
| Prompts | `order-review`、`verification-checklist` | 原生 list/get | modern 与 legacy 均 2/2；参数渲染通过 |
| Skills | 2 个应用级 Skill | `skills.discover/run` | 发现、两类摘要、清单、错误路径通过 |
| Apps | 单文件 Widget + JSON-RPC bridge | Tool `_meta` 关联 `ui://` | 构建与 bridge 契约通过；精简后的主 Flow 不嵌入 iframe |
| Tasks | 5 个应用级 Task Tool | create/status/list/cancel/result | 轮询、完成、取消、结果、未知 ID 通过 |
| Auth | 可配置 Bearer Token + scope | `MCP_AUTH_TOKEN` 或注入配置 | 401、403、合法 Client 调用通过 |
| Verification | start/status/finish | 服务端证据链判定 | 确认通过与拒绝失败路径均通过 |
| v2 发现与缓存 | `server/discover` + list/read | public `ttlMs/cacheScope` | discover/list/read 实际响应通过 |
| v2 Schema | 13 个 Tool `outputSchema` | `orders.search` 使用 `$defs`、`$ref`、`allOf` | SDK 客户端运行时校验通过 |
| v2 Trace | W3C `traceparent` | 请求元数据贯穿 Tool 调用 | Tool 结果证据回读通过 |
| v2 多轮交互 | `verification.finish` | `input_required` + HMAC `requestState` | 自动 fulfil、服务端重入、确认/拒绝通过 |
| 场景工作流 | 6 个动态入口 API + React Flow | 实际 `route` 与独立 latest 槽位 | 6/6 通过，4/5 步分支与隔离通过 |

> Tasks 使用应用级 Tool 模型，不伪装成 v2 核心能力。若产品需要协议级异步
> 任务，需要另行接入并验收 Tasks Extension；当前 `tasks.*` 只属于应用层。

## 3. 协议兼容矩阵

| 路径 | 目标版本 | 协商 | 响应封装 | 结果 |
| --- | --- | --- | --- | --- |
| Modern pinned | `2026-07-28` | 显式 `pin` | `application/json` | 通过 |
| Auto | modern + legacy | 自动优先 modern | `application/json` | 通过 |
| Legacy stateless | `2025-06-18` | 固定 supported version | `text/event-stream` | 通过 |
| 独立旧 SSE endpoint | 不提供 | 不适用 | 不适用 | 符合设计 |
| `subscriptions/listen` | 不提供 | 不宣告订阅能力 | 不适用 | 符合当前静态目录 |
| 动态入口扩展 | `com.kenvoai.mcp-v2.dynamic-entry` | `server/discover` | 项目本地 Extension | 通过 |

| 已纠正的旧口径 | 正确结论 |
| --- | --- |
| 所有请求都是 JSON | 只有 modern 成功结果固定为 JSON；legacy stateless 使用 SSE 响应帧 |
| Skills 是 MCP 原生对象 | Skills 是本项目基于 Tool 的应用层抽象 |
| Tasks 必须实现旧版原生 RPC | 当前 SDK 已移除该运行时，使用明确标识的应用级 `tasks.*` Tool |
| Auth 已实现就等于生产安全 | 当前是 Bearer/scope 基线，生产仍需外部身份源和密钥治理 |

## 4. Tool 清单

| 类别 | Tool | 类型 | 验收 |
| --- | --- | --- | --- |
| 系统 | `system.health` | 只读 | 协议与传输声明 |
| 订单 | `orders.search` | 只读 | 命中与空结果 |
| 订单 | `orders.dashboard` | 只读 | 三视图、筛选、MCP App 元数据 |
| Skills | `skills.discover` | 只读 | 2 个 Skill |
| Skills | `skills.run` | 只读 | 摘要、清单、未知 Skill |
| Verification | `verification.start` | 写入 | 创建运行记录 |
| Verification | `verification.status` | 只读 | 读取证据 |
| Verification | `verification.finish` | 写入 | 确认与拒绝 |
| Tasks | `tasks.create` | 写入 | pending/completed 创建 |
| Tasks | `tasks.status` | 只读 | 状态轮询 |
| Tasks | `tasks.list` | 只读 | 列表发现 |
| Tasks | `tasks.cancel` | 写入 | 取消 pending Task |
| Tasks | `tasks.result` | 只读 | 完成结果与错误路径 |

| `orders.dashboard` 元数据 | 值 |
| --- | --- |
| `ui.resourceUri` | `ui://mcp-v2/orders-dashboard.html` |
| `ui/resourceUri` | `ui://mcp-v2/orders-dashboard.html` |
| `openai/outputTemplate` | `ui://mcp-v2/orders-dashboard.html` |

## 5. Auth 验收

| 场景 | 预期 | 结果 |
| --- | --- | --- |
| 未携带 Token | `401` + Bearer challenge | 通过 |
| 无效 Token | `401` | 通过 |
| scope 不足 | `403` | 通过 |
| 合法 Token + `mcp:access` | MCP handshake 和 `system.health` 成功 | 通过 |
| 本地未设置 `MCP_AUTH_TOKEN` | 保持免鉴权开发模式 | 通过 |
| 设置 `MCP_AUTH_TOKEN` | `/mcp` 启用 Bearer Auth | 已实现 |
| Token 泄露保护 | 验收使用随机 Token，不打印、不提交 | 通过 |

## 6. E2E 与自动化门禁

| E2E 分组 | 数量 | 覆盖 |
| --- | ---: | --- |
| Protocol | 3 | JSON HTTP、modern、legacy |
| Discovery | 4 | 13 Tools、Resource、2 Prompts、Prompt 渲染 |
| Tools | 9 | health、orders、Dashboard、Tasks |
| Skills | 5 | 发现、摘要、清单、拒绝 |
| Verification | 2 | 成功证据链、未确认失败 |
| MCP Apps | 2 | bridge、`ui://` 元数据 |
| 合计 | 25 | 25/25 |

| 门禁 | 实际结果 |
| --- | --- |
| TypeScript | 4 个 workspace 通过 |
| Bun tests | 以根级 `bun run test` 实时结果为准 |
| Production build | Web、MCP App、Server 通过 |
| HTTP acceptance | 通过，含 Prompt、Task、Auth、6 个场景闭环与隔离 |
| 服务端 E2E | 25/25 |
| Playwright | desktop + 390px，10/10 |
| Codex-oriented acceptance | 通过 |

## 7. 客户端与 UI

| 客户端/宿主 | Tool | Prompt | MCP App UI | 结论 |
| --- | --- | --- | --- | --- |
| SDK modern Client | 通过 | 通过 | 不适用 | 通过 |
| SDK auto Client | 通过 | 未单列 | 不适用 | 通过 |
| SDK legacy Client | 通过 | 通过 | 不适用 | 通过 |
| Codex CLI `0.145.0` | 通过 | 本轮未复测 | CLI 不承诺内嵌 UI | Tool 链路通过 |
| 当前 Codex Desktop task | 已有调用证据 | 本轮未复测 | 未观察到 widget | Tool 与 UI 分开判定 |
| 仓库 Web 主 Flow | 通过 | 不适用 | 未嵌入 | 服务端 App 路线证据通过；实际 Widget 由独立构建覆盖 |

## 8. 仍未完成

| 优先级 | 项目 | 当前影响 | 下一步 |
| --- | --- | --- | --- |
| P0 | 外部 OAuth/OIDC 与密钥轮换 | 当前 Auth 适合 Demo/受控环境 | 接入 issuer/JWKS、audience、过期与轮换 |
| P0 | 持久化与多实例一致性 | Task 与 Verification 当前在内存 | 引入数据库、幂等键、恢复和清理策略 |
| P0 | 限流、指标、结构化审计 | 已有请求 Trace，但不满足公网运维要求 | 增加 rate limit、OpenTelemetry、metrics、告警 |
| P1 | Tasks Extension | 当前只有应用级 `tasks.*` Tool | 仅在需要协议级异步任务时接入官方扩展 |
| P1 | Codex Desktop 内嵌 UI | 无法确认真实 widget 体验 | 宿主提供可调用/可渲染链路后复测 |
| P2 | 动态订阅 | Tool/Resource/Prompt 目录变化不会推送 | 有动态目录需求时实现 |

## 9. 环境与入口

| 项目 | 值 |
| --- | --- |
| Bun | `1.3.14` |
| TypeScript | `7.0.2` |
| Rsbuild | `2.1.9` |
| React | `19.2.8` |
| MCP Server SDK | `@modelcontextprotocol/server@2.0.0` |
| 验证中心 | `http://localhost:3000/` |
| MCP Server | `http://localhost:3001/mcp` |
| 状态接口 | `http://localhost:3001/api/status` |

| 操作 | 命令 |
| --- | --- |
| 本地启动 | `bun run dev` |
| 完整验收 | `bun run acceptance` |
