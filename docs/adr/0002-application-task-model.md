# ADR 0002: Application-level Task model

## Status

Accepted.

## Context

The current `@modelcontextprotocol/server@2.0.0` runtime for protocol
`2026-07-28` does not provide the older native Task RPC vocabulary. The demo
still needs to prove creation, polling, listing, cancellation, results, and
error behavior.

## Decision

Expose the workflow as explicit application Tools:

- `tasks.create`
- `tasks.status`
- `tasks.list`
- `tasks.cancel`
- `tasks.result`

Report the model as `application-tools`. Do not advertise removed native Task
capabilities or describe the implementation as protocol-native Tasks.

## Consequences

Modern and legacy clients can exercise the same bounded workflow through Tool
calls. Production adoption would still require persistence, idempotency,
ownership, expiry, recovery, and multi-instance coordination.

## Evidence

See the Task domain tests, HTTP acceptance, E2E runner, and capability matrix
in `docs/verification-report.md`.
