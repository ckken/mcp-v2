# MCP v2 兼容性验证报告

验证日期：2026-07-30

## 1. 最终结论

| 评估对象 | 当前结论 | 支持程度 | 完成边界 |
| --- | --- | ---: | --- |
| MCP v2 正常运行 | 可用 | 约 90% | modern、auto、legacy、Tool、Resource 和结构化结果均通过 |
| 当前已实现能力 | 全部通过 | 5/5 | `tools/resources/skills/apps/verification` |
| 规划能力覆盖 | 部分完成 | 5/8（62.5%） | `prompts/tasks/auth` 尚未实现 |
| Web Host MCP App | 通过 | 100%（当前用例） | 三种视图、四种状态、桌面和 390px 均通过 |
| Codex CLI Tool 调用 | 通过 | 100%（当前用例） | CLI `0.145.0` 已直接调用 `orders.dashboard` |
| Codex Desktop Tool 调用 | 通过 | 100%（当前用例） | 当前 task 已发现并调用 `orders.dashboard` |
| Codex Desktop 内嵌 UI | 未验证 | 不计入通过 | 没有可确认的 App/widget 渲染事件 |
| 公网生产就绪 | 未完成 | 不建议评级为完成 | 缺 Auth、持久化、限流、监控和生产错误治理 |

结论口径：

- “约 90%”描述当前 Demo 的 v2 正常运行成熟度，不代表覆盖 MCP v2 全部可选能力。
- “5/8”只统计本项目定义的八类运行时能力，不等同于 MCP 官方规范覆盖率。
- Tool 调用成功、Resource 可读取和 Desktop 实际渲染 App 是三个独立验收项。

## 2. 协议兼容矩阵

| 路径 | 目标版本 | 协商方式 | 实际响应封装 | 状态 | 证据 |
| --- | --- | --- | --- | --- | --- |
| Modern pinned | `2026-07-28` | 显式 `pin` | `application/json` | 通过 | 实际协商版本和 era 均已断言 |
| Auto negotiation | modern + legacy | `auto` | modern JSON | 通过 | 同时支持两个时代时优先选择 modern |
| Legacy stateless | `2025-06-18` | 固定 `supportedProtocolVersions` | `text/event-stream` | 通过 | Tool 发现和 `orders.dashboard` 调用成功 |
| 独立 SSE endpoint | 不提供 | 无 | 无 | 符合设计 | legacy SSE 只是同一 `/mcp` POST 的响应帧 |
| `subscriptions/listen` | 不启用 | 能力不广告 | 无 | 符合设计 | `tools/resources.listChanged=false` |

重要修正：

| 原口径 | 审计结果 | 修正后口径 |
| --- | --- | --- |
| 所有 MCP 响应都是 JSON | 不准确 | modern 返回 JSON；legacy stateless 使用 SSE 响应帧 |
| `mode: "legacy"` 等于验证 `2025-06-18` | 不准确 | 当前 SDK 默认会协商到 `2025-11-25` |
| Server 不支持 SSE | 表述过宽 | 没有独立 SSE endpoint，但 legacy POST 结果存在 SSE framing |

## 3. 功能支持矩阵

| 能力 | 状态 | 实现方式 | 验收结果 |
| --- | --- | --- | --- |
| Tools | 已实现 | 8 个 MCP Tool | 8/8 发现和调用通过 |
| Resources | 已实现 | `ui://mcp-v2/orders-dashboard.html` | list/read/MIME 通过 |
| Skills | 已实现 | `skills.discover`、`skills.run` | 2/2 应用层 Skill 通过 |
| Apps | 已实现 | sandbox iframe + JSON-RPC bridge | Web Host 通过 |
| Verification | 已实现 | start/status/finish + 脱敏证据 | 成功和拒绝路径通过 |
| Prompts | 未实现 | 未注册协议能力 | 不计入通过 |
| Tasks | 未实现 | 未注册协议能力 | 不计入通过 |
| Auth | 未实现 | 无 Bearer/OAuth/scope | 不具备公网生产条件 |

Skills 是由 Tool 组合出的应用层能力，不宣称为 MCP 核心原生对象。

## 4. Tool 验收矩阵

| Tool | 类型 | 安全注解 | 主要验收 |
| --- | --- | --- | --- |
| `system.health` | 只读 | 只读、非破坏、闭合世界、幂等 | 协议和传输声明 |
| `orders.search` | 只读 | 只读、非破坏、闭合世界、幂等 | 命中和空结果 |
| `orders.dashboard` | 只读 | 只读、非破坏、闭合世界、幂等 | 三视图、筛选、UI 元数据 |
| `skills.discover` | 只读 | 只读、非破坏、闭合世界、幂等 | 发现 2 个 Skill |
| `skills.run` | 只读 | 只读、非破坏、闭合世界、幂等 | 摘要、清单和未知 Skill |
| `verification.status` | 只读 | 只读、非破坏、闭合世界、幂等 | 读取真实运行记录 |
| `verification.start` | 状态写入 | 非破坏、闭合世界、非幂等 | 创建脱敏 run |
| `verification.finish` | 状态写入 | 非破坏、闭合世界、非幂等 | 确认和拒绝路径 |

`orders.dashboard` 的 Tool 声明与结果均包含：

| 元数据 | 值 |
| --- | --- |
| `ui.resourceUri` | `ui://mcp-v2/orders-dashboard.html` |
| `ui/resourceUri` | `ui://mcp-v2/orders-dashboard.html` |
| `openai/outputTemplate` | `ui://mcp-v2/orders-dashboard.html` |

## 5. MCP App 验收

| 场景 | 参数或动作 | 预期结果 | 状态 |
| --- | --- | --- | --- |
| 初始加载 | `view=overview,status=all` | 3 条订单和概览指标 | 通过 |
| 订单筛选 | `view=orders,status=paid` | 仅返回 `ord_demo_1001` | 通过 |
| 状态视图 | `view=status,status=fulfilled` | 展示 fulfilled 分布 | 通过 |
| 组件反向调用 | Tabs / Select | iframe 经 host 再次调用 Tool | 通过 |
| 单文件资源 | 读取 `ui://` | 无外部 script/stylesheet | 通过 |
| 宿主异常 | 10 秒无响应 | 显示错误，不永久 Connecting | 已实现 |
| Codex Desktop 内嵌渲染 | Desktop task | 出现可确认 widget | 未验证 |

## 6. 客户端验收

| 客户端 | 协议 | Tool 发现 | Tool 调用 | UI 渲染 | 结论 |
| --- | --- | --- | --- | --- | --- |
| SDK modern Client | `2026-07-28` | 通过 | 通过 | 不适用 | 通过 |
| SDK auto Client | 自动选择 modern | 通过 | 通过 | 不适用 | 通过 |
| SDK legacy Client | `2025-06-18` | 通过 | 通过 | 不适用 | 通过 |
| Codex CLI `0.145.0` | legacy stateless | 通过 | 通过 | CLI 不承诺内嵌 UI | 通过 |
| 当前 Codex Desktop task | 当前宿主链路 | 通过 | 通过 | 未观察到 widget 事件 | Tool 通过，UI 未验证 |
| 仓库 Web Host | modern | 通过 | 通过 | 通过 | 完整 App 链路通过 |

最新真实 Codex CLI 会话：

| 项目 | 结果 |
| --- | --- |
| 会话 | `019fb0d1-7dd6-78b2-82b1-25db931e9c98` |
| 调用 | `orders.dashboard(view=orders,status=paid)` |
| 订单数 | 1 |
| 首个订单 | `ord_demo_1001` |
| 原始 Tool `_meta` | 包含 `openai/outputTemplate` |
| 注意事项 | CLI 最终自然语言误报元数据不存在，验收以原始 Tool 事件为准 |

## 7. 自动化门禁

| 门禁 | 覆盖内容 | 结果 |
| --- | --- | --- |
| TypeScript | 4 个 workspace | 通过 |
| Bun tests | 15 项单元/契约测试 | 15/15 |
| Production build | Web、MCP App、Server | 通过 |
| HTTP acceptance | modern、auto、legacy、响应头、Tool、Resource | 通过 |
| 服务端 E2E | 6 组场景、20 个用例 | 20/20 |
| Playwright | desktop Chromium + 390px | 6/6 |
| Codex-oriented acceptance | health、Skill、订单、验证链 | 通过 |
| 真实 Codex CLI | 直接调用 `orders.dashboard` | 通过 |
| 当前 Desktop Tool | 发现并调用 `orders.dashboard` | 通过 |
| Desktop App/widget | 实际内嵌渲染事件 | 未验证 |

完整门禁命令：

```bash
bun run acceptance
```

说明：`acceptance:codex` 验证 Codex-oriented MCP Client 链路，不单独证明
Desktop 内嵌 UI；真实 CLI 和当前 Desktop Tool 调用已在上表独立列出。

## 8. E2E 覆盖

| 分组 | 覆盖范围 |
| --- | --- |
| Protocol | modern、legacy、状态与响应封装 |
| Discovery | 8 个 Tool、MCP App Resource |
| Tools | health、订单命中/空结果、Dashboard 三视图 |
| Skills | 发现、摘要、清单、未知 Skill 拒绝 |
| Verification | 完整证据链、未确认拒绝 |
| MCP Apps | 单文件 bridge、Tool 与 `ui://` 元数据 |

E2E 页面只在服务端返回真实报告后播放 20 个用例的
queued → running → passed/failed 状态，不在浏览器补造成功结果。

## 9. 未完成项与优先级

| 优先级 | 未完成项 | 影响 | 建议 |
| --- | --- | --- | --- |
| P0 | Auth | 不能安全暴露到公网 | 增加 Bearer/OAuth、scope、401/403 验收 |
| P0 | 持久化与生产错误治理 | 当前验证运行保存在内存 | 增加存储、结构化日志、指标和恢复 |
| P1 | Codex Desktop 内嵌 UI | Tool 可用但 widget 未确认 | 等待宿主能力后做真实渲染验收 |
| P1 | Tasks | 无异步任务、取消和恢复 | 按真实业务需求实现 |
| P2 | Prompts | 不提供 Prompt registry | 仅在需要公开 Prompt 能力时实现 |
| P2 | Subscriptions | 不提供 list-changed 事件 | 有动态目录需求时再开启 |

## 10. 历史复测摘要

| 阶段 | 结果 | 当前意义 |
| --- | --- | --- |
| v2-only Server + Codex `2025-06-18` | 返回 `-32022` | 证明旧 Codex 需要 legacy fallback |
| Codex CLI `0.147.0-alpha.1` | modern Tool 调用通过 | 证明纯 v2 客户端可运行 |
| Codex CLI 回退 `0.145.0` | legacy Tool 和 Skill 通过 | 当前兼容基线 |
| 早期 Desktop task | 有未发现 Tool 的失败记录 | 属于当时注入/宿主状态，不代表当前服务失败 |
| 当前 Desktop task | Tool 发现和调用通过 | 当前结论；内嵌 UI 仍未验证 |

## 11. 环境与入口

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

本地启动：

```bash
bun run dev
```

主要截图：

| 场景 | 文件 |
| --- | --- |
| Overview | `artifacts/overview.png` |
| Mobile | `artifacts/mobile.png` |
| MCP App | `artifacts/mcp-app-dashboard.png` |
| MCP App filtered | `artifacts/mcp-app-dashboard-filtered.png` |
| E2E Lab | `artifacts/e2e-lab.png` |
