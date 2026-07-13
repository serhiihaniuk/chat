# Pi project setup guide

Read this when: you are installing, starting, or troubleshooting Pi for this Side Chat checkout.
Source of truth for: the project-local Pi startup procedure, operator checks, and the boundary between tracked project configuration and private machine state.
Not source of truth for: Side Chat architecture (see `../architecture/system-map.md`), repository verification (see `../operations/verification.md`), or Pi and `pi-subagents` behavior outside the versions configured here.

This repository configures a Sol/high parent with one permitted project-scoped child named `implementer`. The parent owns reconnaissance, planning, review, coordination, and scope decisions. The child executes an approved implementation slice.

## Configuration boundary

The repository tracks the portable Pi behavior:

- `.pi/settings.json` selects the parent model, pins `npm:pi-subagents@0.34.0`, scopes explicit child model requests, and disables built-in child roles.
- `.pi/APPEND_SYSTEM.md` adds repository orchestration policy without replacing Pi's base prompt.
- `.pi/agents/implementer.md` defines the only permitted project child.
- `scripts/pi-project.ps1` starts from the repository root with spawn and nesting limits.

Keep authentication, trust decisions, sessions, caches, package restoration data, and machine-specific shell configuration outside Git. Do not copy or print private Pi files while setting up this project.

## Machine prerequisites

Before starting the project wrapper, confirm the machine has:

- a Pi release whose offline model catalog contains `openai-codex/gpt-5.6-sol` and `openai-codex/gpt-5.6-luna`;
- an existing `openai-codex` login permitted to use those models;
- Node.js and Git Bash compatible with the installed Pi release;
- a global Pi `shellPath` pointing to the intended Git Bash executable on Windows.

Machine setup is deliberately not automated by this repository. Preserve existing provider and authentication settings when adding a Windows `shellPath`.

## Start the project

Run the wrapper from the repository root:

```powershell
.\scripts\pi-project.ps1
```

The wrapper sets these process-local limits before starting Pi:

- at most 10 child launches for the parent session;
- one child level, so an implementer cannot recursively fan out;
- `.pi/worktrees/` as the generated worktree base when worktree isolation is requested.

To state the parent selection explicitly:

```powershell
.\scripts\pi-project.ps1 --model openai-codex/gpt-5.6-sol --thinking high
```

Trust the project only after reviewing `.pi/settings.json` and its pinned package. Restart Pi if trust was granted after the first load. For a deliberate one-command bootstrap after that review, run `pi install npm:pi-subagents@0.34.0 -l --approve` from the repository root.

## Verify the loaded configuration

Run these non-secret checks from PowerShell:

```powershell
Get-Content .pi/settings.json -Raw | ConvertFrom-Json | Out-Null
pi --version
pi --offline --list-models
pi list
```

Then run these commands inside the project Pi session:

```text
/subagents-doctor
/subagents-models
/subagents-models implementer
/subagents-fleet
```

The live results must show:

- parent model `openai-codex/gpt-5.6-sol` with `high` thinking;
- `implementer` as the only project-scoped child;
- implementer model `openai-codex/gpt-5.6-luna` with `max` thinking;
- explicit per-run child model requests outside `subagents.modelScope.allow` rejected.

`modelScope.enforce` governs explicit per-run model selection. A configured frontmatter, default, override, or inherited model outside the list may produce a warning instead of a hard rejection, so keep every configured model inside the same list and inspect `/subagents-models implementer` after changes.

`disableBuiltins` hides the package's bundled roles, not arbitrary user or package agents. Keep subagent tool calls on `agentScope: "project"`; the checked-in policy permits only `implementer` even if a machine has other user-scoped agents.

File contents alone do not prove model entitlement, package restoration, or live routing. Record those results in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) when verified.

## Delegate implementation

Before delegation, the parent must establish the outcome, owned files or boundary, applicable source-of-truth docs, constraints, acceptance criteria, and verification target. The implementer may then inspect the assigned path, edit it, run focused checks, and report evidence.

Use worktree isolation only for independent write tasks and only when the repository state makes that safe. Never run concurrent implementers against the same checkout or overlapping files.

## Troubleshooting

If project settings do not load, start at the repository root, inspect trust state without printing credentials, restart Pi, and run `/subagents-doctor`.

If the child model is wrong, inspect `/subagents-models implementer`, confirm the full provider-qualified model in the agent file, and confirm the same model appears in `subagents.modelScope.allow`.

If an unexpected built-in role appears, confirm `subagents.disableBuiltins` is `true`, reload or restart Pi, and repeat the model listing.

If shell commands resolve through the wrong Windows shell, repair the machine-global Pi `shellPath`; do not add a personal absolute path to this repository.
