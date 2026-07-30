# MCP v2 Visual Verification Context

## Product goal

This repository is a runnable compatibility lab for MCP `2026-07-28`. It keeps
the modern protocol path explicit while proving a bounded stateless fallback
for `2025-06-18` clients. The product includes an MCP Server, a sandboxed MCP
App, a browser verification host, shared runtime contracts, and repeatable
acceptance gates.

## Domain boundaries

| Area | Owner | Responsibility |
| --- | --- | --- |
| Protocol runtime | `services/mcp` | MCP transport, negotiation, Tools, Resources, Prompts, application Tasks, Auth baseline, and verification evidence |
| MCP App | `apps/mcp-app` | Self-contained `ui://` order dashboard and host bridge interaction |
| Verification host | `apps/web` | Six independent React Flow closed-loop scenes and browser acceptance |
| Shared contracts | `packages/shared` | Cross-workspace schemas, fixtures, and stable DTOs |
| Delivery gate | root workspace | Typecheck, tests, builds, HTTP acceptance, browser acceptance, and Codex-oriented acceptance |

## Stable terminology

| Term | Meaning |
| --- | --- |
| modern | MCP `2026-07-28`, pinned or auto-negotiated, with JSON result framing |
| legacy stateless | MCP `2025-06-18` compatibility on the same Streamable HTTP endpoint, with SSE result framing |
| Skill | An application-level composition exposed through `skills.*` Tools, not a native MCP object |
| Task | An application-level workflow exposed through `tasks.*` Tools; it does not claim removed native Task RPC support |
| MCP App | A Tool-linked `ui://` Resource rendered by a host through the MCP Apps bridge |
| verification | Server-owned evidence and confirmation state; clients cannot directly manufacture a passing result |
| scenario | A server-owned runtime route derived from a bounded dynamic entry; each scene owns an isolated latest result |

## Non-negotiable boundaries

- Do not advertise unsupported subscriptions or a standalone legacy SSE
  endpoint.
- Keep demo data bounded and do not persist tokens, private configuration, raw
  conversations, or non-demo business data.
- Treat Tool invocation, Resource discovery, and actual host widget rendering
  as separate acceptance results.
- Local Bearer Auth is a controlled-environment baseline, not a claim of
  production OAuth/OIDC readiness.
- Use Bun for workspace commands and `bun run acceptance` as the complete
  delivery gate.

## Decision and evidence sources

| Source | Purpose |
| --- | --- |
| `docs/adr/` | Stable decisions and their consequences |
| `docs/implementation-plan.md` | Intended implementation and technical boundaries |
| `docs/e2e-acceptance-plan.md` | Automated acceptance scope |
| `docs/verification-report.md` | Current verified support and remaining production gaps |
| `docs/agents/` | Agent workflow, issue ownership, and status vocabulary |
