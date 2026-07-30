# Issue tracker

## System of record

| Work item | System of record |
| --- | --- |
| Product, defect, compatibility, and engineering work | GitHub Issues for the configured repository |
| External code review and integration | GitHub Pull Requests for the configured repository |
| Architecture decisions | `docs/adr/` in this repository |
| Domain language and ownership | Root `CONTEXT.md` |

The repository currently has no established Issue or Pull Request backlog.
New work should therefore start with an Issue only when it benefits from
cross-session ownership, triage, or external review; a direct user-authorized
atomic change does not need a ceremonial Issue.

## External write gate

Agents may read Issues, Pull Requests, labels, checks, and repository metadata
when needed. Creating or changing an Issue, label, Pull Request, comment,
review state, milestone, assignee, or release requires explicit task
authorization. Repository implementation authorization does not automatically
authorize unrelated external workflow changes.

## Lifecycle

| State | Entry condition | Exit condition |
| --- | --- | --- |
| `needs-triage` | New work lacks an accepted owner, scope, or priority | Move to `needs-info`, `ready-for-agent`, `ready-for-human`, or `wontfix` |
| `needs-info` | Progress requires a concrete user or maintainer decision | Requested information is recorded and scope becomes actionable |
| `ready-for-agent` | Scope, acceptance, dependencies, and write authorization are sufficient | Implementation begins or a new blocker is found |
| `ready-for-human` | Agent work is complete but human product, security, or release judgment remains | Human accepts, requests changes, or closes the item |
| `wontfix` | Maintainer explicitly rejects or retires the work | Reopen only with new evidence or changed constraints |

Status labels describe workflow state. Type labels such as `bug`,
`enhancement`, and `documentation` describe the nature of the work and may be
used alongside exactly one active workflow status.

