# ADR 0001: Modern and legacy response framing

## Status

Accepted.

## Context

The server targets MCP `2026-07-28` while remaining callable by a bounded
`2025-06-18` stateless client. The two protocol eras do not use identical
result framing.

## Decision

- Pin or auto-negotiate modern clients to `2026-07-28`.
- Return modern successful results as `application/json`.
- Serve the `2025-06-18` stateless fallback on the same Streamable HTTP
  endpoint and accept its `text/event-stream` result framing.
- Do not provide a standalone legacy SSE endpoint.
- Do not advertise Tool, Resource, or Prompt subscriptions until dynamic
  directory changes are implemented and verified.

## Consequences

Acceptance must assert response framing per protocol era. Documentation must
not claim that every compatible response is JSON, and legacy SSE framing must
not be confused with a standalone SSE transport.

## Evidence

See `docs/e2e-acceptance-plan.md`, `docs/verification-report.md`, and the HTTP
acceptance runner under `services/mcp`.

