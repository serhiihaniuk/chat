# 12 — Single config system: remove the legacy env parser, fail loudly

**Epic:** 2 First-run | **Priority:** P0 | **Depends on:** 11 | **Status:** todo

## Problem

Two parallel config systems with subtly different semantics coexist:

- The declared system: `apps/partner-ai-service/src/config/sidechat-config/*` driven by `sidechat.config.ts`.
- The legacy env parser: `service-config.ts` (279 lines) + `env/` + `model-catalog/` + `service-capability-config.ts` — roughly a third of `config/`, documented as "slated for removal" (`docs/operations/configuration.md:57`).
- Semantics differ: the config path maps `CONFIGURED`→`ALLOW_ALL` in development (`options/options-adapter.ts:181-189`) while the legacy path _rejects_ `configured` in development (`service-config.ts:134-137`); default profiles differ; `normalizeBearerToken` is duplicated (`environment.ts:170-171` vs `service-config.ts:277-278`).
- **The fallback is silent:** `loadSelectedSideChatConfig` catches ANY import error (a typo in `sidechat.config.ts`!) and returns `{loaded:false, reason}`; `server.ts:62-79` then boots the legacy parser **without logging the reason** — the service silently runs a different universe (different defaults, no Azure) with the declared config ignored.

## Decided approach

One config system, final state (per AGENTS.md). The config file's design — one big, deliberately repetitive, human-readable file per variant, env declared inline via `readEnv` — is recorded in **ADR 0010** (`docs/adr/0010-readable-declarative-config.md`); this story removes the competing system, it must not "optimize" the surviving one:

1. **Delete the legacy env parser** and its exclusive helpers (`service-config.ts`, `createPartnerAiServiceOptionsFromEnv`, duplicated normalizers, its tests). Anything still needed (e.g. `readServicePort` fallback pieces) moves into the sidechat-config modules.
2. **Config load failure is fatal and loud:** `server.ts` prints the load error (file, reason) and exits non-zero. No fallback. A missing/broken `sidechat.config.ts` must never silently boot different behavior.
3. `SIDECHAT_PROVIDER` env var: delete if only the legacy parser read it (story 11 moved the launcher off it); grep to confirm.
4. Sweep tests/harness scripts that boot via env-only options and point them at config selections (`SIDECHAT_CONFIG` / `SIDECHAT_CONFIG_PATH`).
5. Update `docs/operations/configuration.md`: one system, the selection mechanism, the env-reference (`readEnv`) contract, and the fatal-on-error behavior.

## Tasks

1. `grep -rn "createPartnerAiServiceOptionsFromEnv\|service-config" apps scripts test-harness` — enumerate every consumer before deleting.
2. Delete + migrate; keep `PartnerAiServiceOptions` (the programmatic seam) untouched — embedders constructing options in code are unaffected.
3. Make `createBootConfig` fail fatally with the reason; add a boot test for "config throws → process reports the reason and exits non-zero".
4. Reconcile the semantics differences deliberately (the config path's dev `CONFIGURED→ALLOW_ALL` mapping wins — it's the documented posture; note it in configuration.md).
5. Docs update in the same patch.

## Acceptance criteria

- [ ] `service-config.ts` and the env-only options builder are gone; one options builder remains.
- [ ] A syntax error in `sidechat.config.ts` produces a clear fatal boot error naming the file and reason (test).
- [ ] All launchers/harnesses boot through config selection; `npm run dev`, `run-local-fake` (all three modes), adoption harness, e2e all green.
- [ ] `docs/operations/configuration.md` describes exactly one system.

## Verification

```sh
npm test --workspace @side-chat/partner-ai-service
node scripts/run-local-fake.mjs --yes
npm run test:e2e
npm run verify
```
