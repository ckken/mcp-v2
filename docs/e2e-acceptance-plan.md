# 独立场景与 E2E 验收规划

## 完成边界

| 项目 | 验收口径 |
| --- | --- |
| Modern | Client 固定 `2026-07-28` |
| Legacy | Client 固定 `2025-06-18`，验证同一 `/mcp` 的 stateless fallback |
| 结果来源 | `POST /api/e2e/run` 实时生成，前端不补造成功状态 |
| 场景来源 | `GET /api/scenarios/:id/entry` 实时发现；`POST .../run` 只生成该场景的实际路线 |
| 场景隔离 | 六个 latest report 槽位相互独立，不跨应用实例泄露 |
| Tasks | 验收 `tasks.*` 应用级 Tool，不宣称旧版原生 Tasks |
| v2 新特征 | 验收 cache hints、JSON Schema 2020-12、outputSchema、Trace Context 和 `input_required` |
| Auth | 独立安全服务验证 401、403 和合法 Bearer 调用 |
| Desktop UI | Tool 调用和 App/widget 渲染分开判定 |

## 25 个用例

| 分组 | 数量 | 覆盖范围 |
| --- | ---: | --- |
| Protocol | 3 | JSON HTTP、modern 握手、legacy fallback |
| Discovery | 4 | 13 个 Tool、MCP App Resource、2 个 Prompt、Prompt 渲染 |
| Tools | 9 | health、订单、Dashboard 三视图、Task 生命周期和错误路径 |
| Skills | 5 | 发现、订单摘要、验证清单、未知 Skill 拒绝 |
| Verification | 2 | 完整证据链通过、未确认路径失败 |
| MCP Apps | 2 | 单文件 bridge、Tool 与 `ui://` 元数据 |
| 合计 | 25 | 六组场景 |

## 13 个 Tool

| 类别 | Tool |
| --- | --- |
| 系统与订单 | `system.health`、`orders.search`、`orders.dashboard` |
| Skills | `skills.discover`、`skills.run` |
| Verification | `verification.start`、`verification.status`、`verification.finish` |
| Tasks | `tasks.create`、`tasks.status`、`tasks.list`、`tasks.cancel`、`tasks.result` |

## 可视化验收

| 检查项 | 预期 |
| --- | --- |
| React Flow | Scene 00–05 各自显示动态入口、实际步骤和回到入口的闭环 |
| 结果回放 | 只播放当前场景真实报告中的 queued、running、passed/failed |
| 动态路径 | modern-only 协议为 4 步；关闭应用任务分支后路线不含 `tools.tasks` |
| 场景隔离 | 运行 Scene 00 或 01 后，另一场景的 `runId` 保持不变 |
| 场景切换 | 每个场景的步骤 ID、状态、耗时和脱敏证据可核对 |
| 操作位置 | 顶部无全局触发；刷新和会话验证只出现在 Scene 05 |
| 桌面 | Chromium 完整通过 |
| 移动端 | 单主 Flow 在 390px 纵向布局、无横向溢出 |
| MCP App | 主 Flow 展示服务端路线证据；Widget 构建与 bridge 契约由独立门禁覆盖 |

## 门禁

| 命令 | 完成条件 |
| --- | --- |
| `bun run typecheck` | 4 个 workspace 全部通过 |
| `bun run test` | 单元与契约测试全部通过 |
| `bun run build` | Web、MCP App、Server 构建通过 |
| `bun run acceptance:http` | 协议、Prompt、Tool、Task、Auth 通过 |
| `bun run acceptance:browser` | desktop + 390px 共 10 项通过 |
| `bun run acceptance:codex` | Codex-oriented 调用链通过 |
| `bun run acceptance` | 汇总门禁全绿且 E2E 为 25/25 |
