# Triage labels

## Workflow labels

| GPT state | Repository label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Scope, owner, priority, or acceptance is not settled |
| `needs-info` | `needs-info` | A specific human decision or missing fact blocks progress |
| `ready-for-agent` | `ready-for-agent` | The item is sufficiently specified and authorized for implementation |
| `ready-for-human` | `ready-for-human` | Agent work is complete and awaits human judgment |
| `wontfix` | `wontfix` | Maintainer intentionally rejects or retires the item |

Use at most one active workflow label. Changing workflow state should replace
the previous workflow label rather than accumulating states.

## Type labels

Existing GitHub type labels such as `bug`, `enhancement`, `documentation`,
`question`, `help wanted`, and `good first issue` remain available. They do not
replace workflow state:

- `question` describes the item type; `needs-info` means progress is blocked.
- `good first issue` describes suitability; `ready-for-agent` means the task is
  actually specified and authorized.
- `invalid`, `duplicate`, and `wontfix` may close an item, but only `wontfix`
  maps directly to the GPT workflow vocabulary.

## Transition checks

Before applying `ready-for-agent`, confirm the target behavior, scope,
non-goals, acceptance, dependencies, relevant baseline, and write authority.
Before applying `ready-for-human`, record implementation and verification
evidence plus the exact human decision still required.
