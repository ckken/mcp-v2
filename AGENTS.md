# Repository agent instructions

## Agent skills

- Start by reading [`CONTEXT.md`](./CONTEXT.md) and
  [`docs/agents/domain.md`](./docs/agents/domain.md).
- Use [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md) for
  GitHub Issue and Pull Request ownership, write gates, and lifecycle rules.
- Use [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md) when
  applying `$gpt-triage`; status labels and type labels are independent.
- Route ambiguous engineering work with `$gpt-router`. Use `$gpt-architecture`
  for undecided cross-module boundaries, `$gpt-debugging` for unproven root
  causes, `$gpt-implement` for confirmed specifications, and `$gpt-review`
  against an explicit comparison baseline.
- Preserve the repository-managed shadcn Skill under `.agents/skills/shadcn`;
  do not replace it with the global GPT engineering Skills.
- Use Bun workspace commands and the root `bun run acceptance` gate. A health
  endpoint alone is not sufficient user-facing acceptance.
- Do not expose tokens, private configuration, raw conversations, or private
  remote URLs in logs, documentation, issues, or review output.
