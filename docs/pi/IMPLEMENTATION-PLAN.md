# Pi project configuration implementation plan

Read this when: you are applying, verifying, maintaining, or rolling back the project-local Pi setup.
Source of truth for: the Pi setup rollout sequence, acceptance criteria, verification status, risks, and rollback boundary for this repository.
Not source of truth for: configuration rationale (see `KNOWLEDGE.md`), operating commands (see `SETUP-GUIDE.md`), or machine-global Pi installation and credentials.

## Outcome

Add a reproducible, Git-tracked Pi configuration so a Sol/high parent can delegate approved implementation work to one permitted project-scoped Luna/max `implementer`. Keep private and machine-specific Pi state outside the repository.

## Repository files

| File                        | Purpose                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `.pi/settings.json`         | Parent defaults, package pin, explicit-request model scope, and built-in-role disablement |
| `.pi/APPEND_SYSTEM.md`      | Parent orchestration policy                                                               |
| `.pi/agents/implementer.md` | The only permitted project child definition                                               |
| `scripts/pi-project.ps1`    | Project-root launcher with process-local limits                                           |
| `.gitignore`                | Runtime cache, session, package, and worktree exclusions                                  |
| `docs/pi/`                  | Setup procedure, durable decisions, and rollout evidence                                  |

## Rollout sequence

### 1. Add and statically verify project configuration

1. Preserve unrelated working-tree changes.
2. Add or merge the files in the table above.
3. Parse `.pi/settings.json` as JSON.
4. Parse `scripts/pi-project.ps1` with the PowerShell parser.
5. Confirm only intended Pi runtime paths were added to `.gitignore`.
6. Run the repository documentation/readability gate.

### 2. Verify the machine prerequisites

1. Record `pi --version` without exposing authentication data.
2. Confirm the offline registry contains the configured Sol and Luna model IDs.
3. Confirm the machine uses the intended Git Bash executable.
4. Preserve the existing `openai-codex` login; never print or copy its credential file.

### 3. Trust and restore the project package

1. Review `.pi/settings.json` and the pinned package source.
2. Start Pi through `scripts/pi-project.ps1`.
3. Grant project trust interactively only after that review.
4. Restart Pi if required for project package restoration.
5. Confirm `pi list` reports `npm:pi-subagents@0.34.0` and no competing delegation package.

### 4. Prove routing and limits

1. Confirm the parent resolves to Sol/high.
2. Confirm project-scoped discovery exposes only `implementer`, which resolves to Luna/max.
3. Confirm an explicit per-run child model outside the model scope is rejected.
4. Run one approved disposable implementation task.
5. Confirm nested child fan-out is blocked at depth 1.
6. Confirm the parent-session launch cap is 10 through the project wrapper.

## Acceptance status

Repository-static acceptance and read-only model checks can run non-interactively with Pi's one-command `--approve` override. Persisted project trust and an actual implementer task still require an interactive Pi session.

- [x] Project settings pin `npm:pi-subagents@0.34.0`.
- [x] Parent defaults are Sol/high.
- [x] Built-in child roles are disabled.
- [x] The only permitted project-scoped child is `implementer` on Luna/max.
- [x] The enforced explicit-request model scope contains Sol, Luna, and Codex Spark.
- [x] The wrapper sets launch cap 10 and nesting depth 1.
- [x] Known Pi runtime paths are ignored.
- [x] Pi 0.80.6 and the configured models in its offline catalog were verified on 2026-07-13.
- [x] `pi-subagents` was restored locally and `pi list --approve` resolved the pinned project package.
- [ ] Sol/high completes a no-tool live entitlement check through the project wrapper after this routing change.
- [x] Project-scoped discovery resolved only `implementer` on `openai-codex/gpt-5.6-luna`.
- [x] An explicit `openai-codex/gpt-5.5` child request was rejected before launch by the model scope.
- [ ] Persisted project trust is granted in an interactive Pi session.
- [ ] Nested-child depth enforcement is smoke-tested.
- [ ] A disposable approved implementation task completes with focused verification.

Do not mark a live item complete from configuration files alone. Record the command and result when the check actually runs.

## Static verification

```powershell
Get-Content .pi/settings.json -Raw | ConvertFrom-Json | Out-Null

$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path scripts/pi-project.ps1),
    [ref] $tokens,
    [ref] $errors
) | Out-Null
if ($errors.Count -gt 0) { $errors | Out-String | Write-Error }

npm run lint:custom
git diff --check
git status --short
```

Live commands and expected results are owned by `SETUP-GUIDE.md`.

## Risks

| Risk                                             | Mitigation                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Private Pi state enters Git                      | Keep the project/machine boundary explicit and inspect staged paths before any commit |
| Package behavior changes                         | Pin `0.34.0`; review and verify upgrades separately                                   |
| Model appears in the catalog but is not entitled | Separate offline registry checks from a small live smoke test                         |
| Windows resolves the wrong shell                 | Configure the intended Git Bash path globally, never as a personal project path       |
| Child fan-out multiplies cost or writes          | Disable built-ins, enforce model scope, cap launches at 10 and depth at 1             |
| Parallel edits collide                           | Use disjoint worktrees only after the parent approves independent write scopes        |

## Rollback

Rollback is a scoped Git change: revert the project `.pi` files, wrapper, ignore entries, and `docs/pi/` documentation together. Remove the project-local package through Pi's project package command only if it remains registered after the settings rollback.

Do not delete global authentication, trust records, sessions, or unrelated machine settings as part of project rollback.
