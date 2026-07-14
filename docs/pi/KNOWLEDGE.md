# Pi project knowledge

Read this when: you need to understand or change Side Chat's Pi routing, child roles, cost controls, or project-versus-machine boundary.
Source of truth for: durable decisions behind the project-local Pi configuration.
Not source of truth for: setup commands (see `SETUP-GUIDE.md`), rollout status (see `IMPLEMENTATION-PLAN.md`), or package ownership (see `../architecture/package-boundaries.md`).

## Goal

Use the Sol/high parent for judgment and Luna children for narrow semantic work. Use deterministic local tools for repository facts and verification so passing commands do not consume an agent turn. Optimize for elapsed time and Codex quota together; low cost is not useful if it creates rework or weak evidence.

## Execution roles

| Role               | Default model / thinking | Owns                                                                                  | Must not own                                             |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Main Pi chat       | Sol / `high`             | Intent, architecture, external research, scope, sequencing, integration, final review | Outsourcing decisions or completion claims               |
| `context-builder`  | Luna / `low`             | One locate, trace, impact, or plan-state evidence packet                              | Edits, shell commands, architecture                      |
| `implementer`      | Luna / `max`             | One approved behavior in one primary ownership boundary                               | Scope expansion, public-contract decisions, final review |
| `failure-analyst`  | Luna / `low`             | Root cause of one failed deterministic command                                        | Edits or broad suite reruns                              |
| `browser-evidence` | Luna / `low`             | Evidence for one visible scenario                                                     | Code edits, server control, broad UX review              |
| `risk-auditor`     | Luna / `high`            | Conditional audit of high-risk invariants                                             | Style review or speculative redesign                     |

Luna `max` is the deliberate implementer default: the balance of capability and quota chosen for this project. The parent downgrades to `high` for small, well-understood edits or `medium` for mechanical local work; it does not escalate above the default.

## Execution flow

1. The parent interprets the request, owns architecture and scope, and calls `sidechat_task_context` when ownership, plan state, or dirty-file collisions are not already known.
2. `context-builder` answers one bounded `locate`, `trace`, `impact`, or `plan-state` question. It reports evidence and a candidate scope; it does not edit or make architecture decisions.
3. Before implementation, the parent defines the outcome, exact write scope, canonical docs, constraints, acceptance criteria, verification target, and the child's turn budget. The brief carries the deterministic context facts so the child does not rediscover them. Work spanning material ownership boundaries is split.
4. `implementer` owns one approved behavior in one primary boundary. It may spawn the read-only `context-builder` and `failure-analyst` helpers and call `sidechat_verify` on its assigned paths.
5. The parent runs `sidechat_verify` against the assigned paths for the final claim. `failure-analyst` receives the saved log path only after a real failure and returns diagnosis without editing.
6. `browser-evidence` verifies one visible scenario after deterministic checks pass. `risk-auditor` is used only for security, persistence, concurrency, durable workflow, provider/tool, host-command, or public-protocol risk.
7. The parent owns integration, final review, completion claims, and the response.

## Why roles are separated

Recent generic implementer runs repeatedly spent most of their tools rediscovering the repository, running verification, and recovering from oversized scopes. Separate roles reduce that waste:

- deterministic context exposes dirty paths, ownership, docs, workspace checks, and active plan rows before a child starts;
- the context builder performs targeted semantic lookup without write tools;
- the implementer receives an already-approved scope instead of planning its own task;
- deterministic verification returns immediately on success and saves full failure logs outside the prompt;
- the failure analyst reads one log only when a command actually fails;
- browser and risk review run only when the change type requires them.

This is deliberately not a generic multi-agent chain. The parent invokes the smallest role that resolves the current uncertainty.

## Deterministic extension

`.pi/extensions/sidechat-orchestrator/` registers two Pi-only tools:

- `sidechat_task_context` builds a compact repository packet from Git state, Side Chat ownership rules, canonical docs, workspace checks, and `plan/v7/STATUS.md`.
- `sidechat_verify` runs focused, standard, or full checks for explicit repository-relative paths, stops on the first failure, and writes complete output to `.pi/runtime/verification/`. When no check matches the assigned paths it reports a non-pass, so an empty scope is never mistaken for a green result. Typecheck covers the changed workspaces plus their direct dependents from the scope map, so a contract change surfaces downstream type breaks below the full gate.

The tools load in child sessions as well; the implementer uses `sidechat_verify` for its own deterministic checks instead of composing broad shell commands.

The verification tool requires explicit paths because this checkout may already contain unrelated user changes. It never treats the entire dirty worktree as the implementation scope. Commands and arguments are passed separately; user-supplied paths are not interpolated into a shell string.

The extension is orchestration infrastructure. Production application and package source do not import it or know Pi exists.

## Budget and context policy

Every agent starts with fresh context, inherits repository instructions, does not inherit arbitrary skills, and has role-specific tools. Frontmatter enforces hard tool ceilings. `.pi/APPEND_SYSTEM.md` owns the per-call runtime and turn budgets. Only the implementer may create children, limited to the read-only `context-builder` and `failure-analyst` helpers one level deep; helpers are leaves and the implementer remains the only writer in the checkout.

Turn budgets are sized from observed run history: substantive implementation slices needed roughly fifteen assistant turns, and under-provisioned budgets killed runs mid-edit after the full input cost was already paid. Every brief states the child's budget so it can pace itself and reserve the final turn for its report.

When a child hits its ceiling or the completion guard rejects a planning-only result, the parent revives that run with a follow-up instead of paying for a fresh child; checkout edits and the child transcript survive the abort.

Compact task briefs contain only outcome, scope, canonical docs, constraints, acceptance criteria, verification target, turn budget, and the already-gathered context facts. Large outputs are passed by artifact or log path, not pasted into the parent transcript.

Cost and waste stay observable: `node scripts/pi-run-stats.mjs` aggregates the archived run metadata and verification logs into completed-versus-aborted spend, revival counts, and deterministic-check usage. Re-check it before changing budgets or routing so tuning follows evidence, not impressions.

## Routing invariants

- Built-in roles remain disabled and calls use `agentScope: "project"`.
- The parent handles a tiny, already-understood edit directly.
- Unknown ownership or flow starts with deterministic context and one context-builder question.
- One implementer owns one behavior and one primary ownership boundary.
- Passing checks do not launch an agent.
- Failure analysis begins only after a real failed command.
- Browser evidence follows deterministic checks and runs only for visible behavior.
- Risk audit is conditional on security, persistence, concurrency, cancellation, durable workflow, provider/tool, host-command, or public-protocol risk.
- Concurrent writers never share a checkout or overlapping paths.
- Nesting is limited to the implementer's read-only helpers; no generic chains, write-capable children, credential use, external mutation, or Git publishing.

## Project and machine ownership

The repository owns tracked Pi settings, role prompts, orchestration policy, deterministic tool code, wrapper limits, and Pi documentation. The machine owns authentication, trust, sessions, package caches, restored packages, browser state, generated worktrees, verification logs, and personal shell configuration.

Keep machine-private data out of Git. A package or model-policy change requires a separate review and live routing verification.
