# Pi orchestration implementation plan

Read this when: you are implementing, verifying, maintaining, or rolling back the project-local Pi orchestration system.
Source of truth for: rollout sequence, acceptance status, risks, and rollback boundary.
Not source of truth for: durable rationale (see `KNOWLEDGE.md`) or operator commands (see `SETUP-GUIDE.md`).

## Outcome

Replace the single generic Luna/max implementer flow with a cost-aware project-specific system: deterministic context and verification, narrow semantic roles, fresh contexts, explicit scopes, and hard runtime/tool/turn ceilings. Keep all Pi dependencies below `.pi/`; production Side Chat source remains Pi-independent.

## Tracked surface

| Path                                    | Purpose                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| `.pi/settings.json`                     | Parent defaults, package pins, model scope, and disabled built-ins    |
| `.pi/APPEND_SYSTEM.md`                  | Parent routing, thinking profiles, and per-call budgets               |
| `.pi/agents/*.md`                       | Context, implementation, diagnosis, browser, and risk role contracts  |
| `.pi/extensions/sidechat-orchestrator/` | Deterministic context and verification tools                          |
| `scripts/pi-project.ps1`                | Project-root launcher and process-local limits                        |
| `AGENTS.md`, `docs/pi/`                 | Repository contract, operating guide, rationale, and rollout evidence |

## Rollout

1. Add deterministic context and scoped verification tools without a new dependency.
2. Replace the one-agent policy with five narrow project agents; nesting is bounded to read-only helpers under the implementer.
3. Synchronize `AGENTS.md`, parent policy, setup guide, and durable knowledge.
4. Parse and type-check the Pi extension in isolation; check formatting and Git whitespace.
5. Reload Pi and verify project discovery, live model resolution, tools, and budget metadata.
6. Exercise one disposable context call, one bounded implementation call, one passing verification, and one intentionally failing verification routed to failure analysis.

## Acceptance status

- [x] Parent remains Sol/high and built-in children remain disabled.
- [x] Project roles have explicit Luna models, thinking defaults, tools, and fresh context; only the implementer may spawn read-only helpers.
- [x] Implementer defaults to Luna max; high and medium are deliberate per-run downgrades.
- [x] Deterministic context reports dirty paths, ownership scopes, canonical docs, workspace checks, and relevant plan rows.
- [x] Deterministic verification requires an explicit path scope, avoids shell interpolation, stops on first failure, and saves full logs outside Git.
- [x] Production application/package source does not depend on Pi.
- [x] Routing docs and prompts describe the same role boundaries.
- [ ] Pi reload discovers all five roles and both deterministic tools.
- [ ] Live `/subagents-models` confirms the configured model/thinking mapping.
- [ ] A disposable end-to-end routing smoke proves context, implementation, verification, and failure diagnosis.

Do not mark live items complete from static files alone.

## Static verification

```powershell
Get-Content .pi/settings.json -Raw | ConvertFrom-Json | Out-Null
npx tsx --eval "import('./.pi/extensions/sidechat-orchestrator/index.ts')"
npx oxfmt --check .pi/extensions/sidechat-orchestrator .pi/agents .pi/APPEND_SYSTEM.md docs/pi AGENTS.md
git diff --check
git status --short
```

Project tests are intentionally not part of this Pi-only change. Live checks are owned by `SETUP-GUIDE.md`.

## Risks

| Risk                                                   | Mitigation                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Static ownership rules drift                           | Keep rules small; context-builder verifies semantic facts and canonical docs remain authoritative                                      |
| Existing dirty files contaminate verification          | Require explicit paths instead of treating every dirty file as task scope                                                              |
| Agent budget ends before a useful report               | Briefs state the budget; budgets are sized from run history; the parent revives an aborted run with a follow-up instead of relaunching |
| Browser tools are unavailable                          | Browser agent reports blocked; deterministic checks remain valid but visual proof stays incomplete                                     |
| Verification output leaks into Git or prompts          | Logs stay in ignored `.pi/runtime/`; children receive paths, not pasted output                                                         |
| Too many roles recreate generic orchestration overhead | Invoke roles conditionally; there is no automatic all-agent chain                                                                      |

## Rollback

Rollback is one scoped change: restore the earlier agent policy, remove the extra agent files and deterministic extension, and revert synchronized `AGENTS.md` and `docs/pi/` content. Do not delete global authentication, trust records, sessions, or unrelated machine state.
