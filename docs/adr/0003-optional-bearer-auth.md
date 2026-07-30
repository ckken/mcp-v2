# ADR 0003: Optional Bearer Auth baseline

## Status

Accepted.

## Context

The repository must support a frictionless local compatibility lab while also
proving that the MCP endpoint can enforce an authorization boundary in a
controlled environment.

## Decision

- Keep local Auth disabled when `MCP_AUTH_TOKEN` is absent.
- Enable Bearer verification and the `mcp:access` scope when the token is
  configured or an Auth configuration is injected.
- Return a Bearer challenge for missing credentials, `401` for invalid tokens,
  and `403` for insufficient scope.
- Never hardcode, log, document, or commit a real token.

## Consequences

This is a Demo and controlled-environment baseline. It is not production
OAuth/OIDC readiness. Public deployment still requires an external issuer,
JWKS and audience validation, expiry and rotation, revocation, rate limiting,
audit, and multi-instance policy.

## Evidence

See `services/mcp/src/index.ts`, HTTP acceptance, and the Auth section of
`docs/verification-report.md`.
