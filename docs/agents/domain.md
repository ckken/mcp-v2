# Domain documentation

## Canonical entry

Read the root [`CONTEXT.md`](../../CONTEXT.md) before architecture, debugging,
implementation, review, or triage work.

## Module map

| Module | Context to load | Primary verification |
| --- | --- | --- |
| `services/mcp` | Protocol runtime, compatibility, Auth, application Tasks, and evidence ownership | `bun run acceptance:http` and `bun run acceptance:codex` |
| `apps/mcp-app` | `ui://` resource, bridge protocol, bounded demo order presentation | MCP App build and browser host acceptance |
| `apps/web` | Master Flow node navigation, six-route live API projection, desktop and 390px behavior | `bun run acceptance:browser` |
| `packages/shared` | Runtime contracts shared across workspaces | Bun contract tests and typecheck |
| Cross-module delivery | ADRs, compatibility matrix, and complete user path | `bun run acceptance` |

## Existing evidence

| Document | Use |
| --- | --- |
| [`../implementation-plan.md`](../implementation-plan.md) | Planned behavior and implementation constraints |
| [`../e2e-acceptance-plan.md`](../e2e-acceptance-plan.md) | Current automated case boundaries |
| [`../verification-report.md`](../verification-report.md) | Verified support matrix and explicit production gaps |
| [`../adr/0001-modern-legacy-framing.md`](../adr/0001-modern-legacy-framing.md) | Protocol framing decision |
| [`../adr/0002-application-task-model.md`](../adr/0002-application-task-model.md) | Task model decision |
| [`../adr/0003-optional-bearer-auth.md`](../adr/0003-optional-bearer-auth.md) | Auth baseline decision |

## Context strategy

This is a multi-workspace repository but currently one product context. Do not
create `CONTEXT-MAP.md` or package-local context files unless ownership,
terminology, release cadence, or data boundaries genuinely diverge.
