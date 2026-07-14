# Pi project setup guide

Read this when: you are installing, starting, or troubleshooting Pi for this Side Chat checkout.
Source of truth for: project-local Pi startup, operator checks, and tracked-versus-private configuration.
Not source of truth for: Side Chat architecture, repository verification, or Pi behavior outside the pinned versions.

This repository configures a Sol/high parent, five narrow project-scoped Luna roles, and deterministic context/verification tools. The complete routing rationale is in [KNOWLEDGE.md](KNOWLEDGE.md).

## Configuration boundary

The repository tracks:

- `.pi/settings.json` for the parent model, package pins, model scope, and disabled built-ins;
- `.pi/APPEND_SYSTEM.md` for parent routing and per-call budgets;
- `.pi/agents/*.md` for role, tool, context, and hard tool-budget contracts;
- `.pi/extensions/sidechat-orchestrator/` for deterministic repository context and verification;
- `scripts/pi-project.ps1` for process-local launch and nesting limits.

Keep authentication, trust decisions, sessions, caches, restored packages, generated worktrees, verification logs, and machine shell configuration outside Git. Never print or copy private Pi files while setting up the project.

## Start

Run from the repository root:

```powershell
.\scripts\pi-project.ps1
```

The wrapper caps each session at 10 child launches, caps nesting at depth 2 (parent → implementer → read-only helper), and reserves `.pi/worktrees/` for deliberate worktree isolation. To state the parent explicitly:

```powershell
.\scripts\pi-project.ps1 --model openai-codex/gpt-5.6-sol --thinking high
```

Trust the project only after reviewing `.pi/settings.json` and package pins. Restore the pinned delegation package with `pi install npm:pi-subagents@0.34.0 -l --approve` only after that review.

## Verify loaded configuration

Run non-secret checks from PowerShell:

```powershell
Get-Content .pi/settings.json -Raw | ConvertFrom-Json | Out-Null
pi --version
pi --offline --list-models
pi list
```

Then inside the project Pi session:

```text
/subagents-doctor
/subagents-models
/subagents-models context-builder
/subagents-models implementer
/subagents-models failure-analyst
/subagents-models browser-evidence
/subagents-models risk-auditor
```

Confirm:

- the parent is `openai-codex/gpt-5.6-sol` with `high` thinking;
- exactly the five tracked project roles are available with the configured Luna thinking levels (`implementer` at `max`);
- built-in roles are absent for project-scoped discovery;
- `implementer` reports the child-safe `subagent` tool with depth 1; the read-only roles report zero nested depth;
- `sidechat_task_context` and `sidechat_verify` appear after extension reload;
- explicit child models outside `subagents.modelScope.allow` are rejected.

`modelScope.enforce` checks explicit per-run selection after removing a recognized thinking suffix. Keep every base model configured by frontmatter or overrides inside the same allow list.

## Normal operation

1. Use `sidechat_task_context` when task ownership or collision risk is unclear.
2. Call `context-builder` only for a bounded semantic question.
3. Give `implementer` one behavior, one primary boundary, explicit paths, and its turn budget; it may use `sidechat_verify` and the read-only helpers itself.
4. Call `sidechat_verify` with those paths for the final claim; start focused and expand only when justified.
5. On failure, give `failure-analyst` the returned `.pi/runtime/verification/...` path.
6. If a child dies at its turn budget or is rejected as planning-only, revive that run with a follow-up instead of relaunching.
7. Add browser evidence or risk audit only when the change requires it.

Use worktree isolation only for independent write tasks. Never run concurrent implementers against the same checkout or overlapping files.

## Track cost and waste

The session footer tracks the live session, for example:

```text
████▏ wk83 5h97 · Σ $2.51 ↑2.1M ↓89k CH93 · sub 3✓ 1✗$0.25 $0.55 · chk 2✓ 1✗
```

- The eighth-block meter shows the tightest quota window (its label is bold; the other window and any reset countdown stay dim). Meter color turns amber at 40% remaining and red at 20%.
- `Σ` leads with total session cost in bold; token flows and cache-hit rate follow dim.
- `sub` shows child-run outcomes; the aborted cost glues to the `✗` count in red, and the dim trailing figure is total child spend.
- `chk` counts deterministic `sidechat_verify` calls (passes green, failures red).

The `sub` and `chk` segments appear only after the first child run or check.

For history across sessions:

```powershell
node scripts/pi-run-stats.mjs
node scripts/pi-run-stats.mjs --json
```

The report splits spend into completed versus aborted runs, counts revivals and deterministic verifications, and groups cost by week. Review it before loosening any budget or routing rule.

## Troubleshooting

If project settings do not load, start at the repository root, inspect trust state without printing credentials, restart Pi, and run `/subagents-doctor`.

If an agent or model is wrong, inspect `/subagents-models <name>`, its `.pi/agents/<name>.md` frontmatter, and the base model in `subagents.modelScope.allow`.

If deterministic tools are missing, reload Pi and inspect `.pi/extensions/sidechat-orchestrator/index.ts` load errors. Do not copy the extension into production source.

If shell commands use the wrong Windows shell, repair machine-global Pi `shellPath`; never commit a personal absolute path.
