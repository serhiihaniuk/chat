# Pi project knowledge

Read this when: you need to understand or change the repository's Pi model routing, child-agent surface, safety limits, or project-versus-machine boundary.
Source of truth for: the decisions and invariants behind Side Chat's project-local Pi configuration.
Not source of truth for: setup commands (see `SETUP-GUIDE.md`), rollout status (see `IMPLEMENTATION-PLAN.md`), or Side Chat package ownership (see `../architecture/package-boundaries.md`).

## Operating shape

The project uses two execution roles:

| Role                | Model                       | Thinking | Ownership                                                                     |
| ------------------- | --------------------------- | -------- | ----------------------------------------------------------------------------- |
| Main Pi chat        | `openai-codex/gpt-5.6-sol`  | `high`   | Reconnaissance, research, planning, review, coordination, and scope decisions |
| `implementer` child | `openai-codex/gpt-5.6-luna` | `max`    | One approved implementation slice and its focused verification                |

`openai-codex/gpt-5.3-codex-spark` remains in the project model scope as an explicitly available fallback. It is not the configured default for either role.

## Package and child-agent decision

The project pins exactly one delegation package: `npm:pi-subagents@0.34.0`. Its built-in child catalog is disabled. The only permitted project child definition is `.pi/agents/implementer.md`.

Do not add another delegation package alongside `pi-subagents`. A package change requires a separate review of its executable code, configuration contract, commands, runtime paths, and migration impact.

The implementer is write-capable because implementation is its only purpose. Its model, thinking level, tools, inherited project context, and maximum child depth are explicit in frontmatter so the live mapping can be inspected rather than inferred from the parent.

## Project and machine ownership

The repository owns:

- parent and child model defaults;
- the model scope for explicit per-run child requests;
- the exact `pi-subagents` package pin;
- the single implementer prompt and tool surface;
- the orchestration policy;
- wrapper-applied spawn, depth, and worktree-path limits.

The machine owns:

- provider authentication and refresh tokens;
- the Windows shell executable path;
- project trust decisions;
- sessions, package caches, restored package files, and generated worktrees;
- any package configuration documented as global-only.

This boundary keeps credentials and personal paths out of Git while making project behavior reviewable. The ignore rules cover known runtime paths, but ignore rules never make private data safe to copy into the repository.

## Safety invariants

- Built-in child roles remain disabled.
- `implementer` remains the only permitted project-scoped child.
- Parent subagent discovery and runs use `agentScope: "project"` when available.
- The parent approves scope and verification before delegation.
- Explicit per-run child model requests outside the model scope remain blocked.
- The wrapper caps a parent session at 10 child launches.
- Maximum nesting depth remains 1.
- Parallel writers never share a checkout or overlapping files.
- Authentication, trust, sessions, caches, and generated worktrees remain untracked.
- Live model routing and entitlement are verified after configuration changes.

`modelScope.enforce` is not an absolute allowlist for every resolution path. Configured frontmatter, defaults, overrides, and inherited models may warn instead of failing when outside the list. Keep all configured models in the scope and verify their live resolution.

## Change policy

Change one operational variable at a time. Do not update the Pi CLI, package pin, model routing, and safety limits in one unreviewable maintenance pass.

When changing the package or model policy, update `.pi/settings.json`, the implementer definition when applicable, this decision record, the setup guide, and the rollout checks together. Run the static repository checks first, then repeat the live Pi diagnostics listed in `SETUP-GUIDE.md`.
