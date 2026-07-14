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
| `implementer`      | Luna / `high`            | One approved behavior in one primary ownership boundary                               | Scope expansion, public-contract decisions, final review |
| `failure-analyst`  | Luna / `low`             | Root cause of one failed deterministic command                                        | Edits or broad suite reruns                              |
| `browser-evidence` | Luna / `low`             | Evidence for one visible scenario                                                     | Code edits, server control, broad UX review              |
| `risk-auditor`     | Luna / `high`            | Conditional audit of high-risk invariants                                             | Style review or speculative redesign                     |

The parent may override `implementer` with Luna `medium` for mechanical local work or Luna `max` for genuinely coupled, concept-dense work. Maximum thinking is exceptional, not the default.

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
- `sidechat_verify` runs focused, standard, or full checks for explicit repository-relative paths, stops on the first failure, and writes complete output to `.pi/runtime/verification/`.

The verification tool requires explicit paths because this checkout may already contain unrelated user changes. It never treats the entire dirty worktree as the implementation scope. Commands and arguments are passed separately; user-supplied paths are not interpolated into a shell string.

The extension is orchestration infrastructure. Production application and package source do not import it or know Pi exists.

## Budget and context policy

Every agent starts with fresh context, inherits repository instructions, does not inherit arbitrary skills, cannot create children, and has role-specific tools. Frontmatter enforces hard tool ceilings. `.pi/APPEND_SYSTEM.md` owns the per-call runtime and turn budgets.

Compact task briefs contain only outcome, scope, canonical docs, constraints, acceptance criteria, and verification target. Large outputs are passed by artifact or log path, not pasted into the parent transcript.

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
- No generic chains, nested children, credential use, external mutation, or Git publishing.

## Project and machine ownership

The repository owns tracked Pi settings, role prompts, orchestration policy, deterministic tool code, wrapper limits, and Pi documentation. The machine owns authentication, trust, sessions, package caches, restored packages, browser state, generated worktrees, verification logs, and personal shell configuration.

Keep machine-private data out of Git. A package or model-policy change requires a separate review and live routing verification.
