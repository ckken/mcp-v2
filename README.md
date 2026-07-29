# MCP v2 Visual Verification

一个使用 Bun workspace、MCP TypeScript SDK v2、Rsbuild、React 和 TypeScript 7
实现的可视化协议验证 Demo。

## 边界

- 只支持 MCP `2026-07-28` modern era。
- Server 拒绝 legacy 请求。
- 不安装 MCP SDK v1 或 legacy package。
- 不提供 SSE endpoint，不实现 `subscriptions/listen`。
- 所有验证状态均来自真实请求或测试结果。

## Workspace

- `apps/web`：验证中心与 MCP App Host。
- `services/mcp`：Bun MCP Server 与会话验收。
- `packages/shared`：共享契约。
- `docs/implementation-plan.md`：完整实施和验收计划。

## Commands

```bash
bun install
bun run dev
bun run typecheck
bun run test
bun run build
bun run acceptance
```

当前验证证据见 `docs/verification-report.md`。

开发阶段可分别运行：

```bash
bun run dev:mcp
bun run dev:web
```
