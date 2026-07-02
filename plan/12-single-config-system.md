# 12 — Single config system: remove the legacy env parser, fail loudly

**Epic:** 2 First-run | **Priority:** P0 | **Depends on:** 11 | **Status:** done (2026-07-02)

## Delivery notes

- **Deleted:** `service-config.ts` (+ its 279-line test file), `env/service-resumability-config.ts`, the whole `model-catalog/` dir, and `service-capability-config.ts` — all legacy-exclusive (the readable path builds capabilities from `config.context` and model metadata from the config declarations). `SERVICE_ENV_KEYS` slimmed to what the config files actually declare: `SIDECHAT_PROVIDER`, `SIDECHAT_ALLOWED_MODELS`, `SIDECHAT_POLICY_MODE`, `SIDECHAT_ENABLE_DEV_TOOLS`, the reasoning env trio, and the capability env keys are gone. `PartnerAiServiceOptions` (the programmatic seam) untouched.
- **Loud fatal boot:** `loadSelectedSideChatConfig` now RETURNS the selection or THROWS with the module URL + reason — the `{loaded:false}` silent-fallback shape is gone at the type level. `server.ts` has one boot path; `main`'s catch prints and exits 1. Proven live: a broken `SIDECHAT_CONFIG_PATH` prints `Unable to load the SideChat config module at file://…: Cannot find module …` and exits 1; two new selection tests pin missing-module and throws-at-load.
- **The loud failure immediately caught a real bug:** the Playwright webServer's `SIDECHAT_CONFIG_PATH` was repo-root-relative but resolved against the service workspace cwd — the e2e "fake config" server had been silently booting the LEGACY parser since story 11. Paths are now absolute in `playwright.config.ts` and `run-persistent-e2e.mjs` (the interactive launcher already used absolute paths).
- **Launchers:** `run-local-fake.mjs` openai mode boots the default `sidechat.config.ts` (key + optional base URL prompts; the models prompt deleted — declared models apply); dead `SIDECHAT_PROVIDER`/`SIDECHAT_POLICY_MODE` injections removed (saved-pref env renamed `SIDECHAT_LAUNCH_PROVIDER`). `run-persistent-e2e.mjs` boots the fake config over Testcontainers Postgres. `smoke-openai-provider.mjs` boots via `loadSelectedSideChatConfig` and gates on `SIDECHAT_OPENAI_API_KEY` instead of `SIDECHAT_PROVIDER`.
- **Task 6 done:** `outputDeltaFlushInterval` moved out of `resumability` into a new top-level `streaming` key in all three config files + a `SideChatStreamingConfig` contract; env name `SIDECHAT_OUTPUT_DELTA_FLUSH_MS` unchanged. (`SideChatEnvironmentConfig` also moved to `contracts/` — the types file hit its 300-line budget.)
- **Semantics reconciled:** the config path's dev `CONFIGURED→ALLOW_ALL` mapping is the only behavior and is now documented in configuration.md's rules.
- **Docs:** configuration.md — one system, the four-step load with fatal-on-error, legacy references gone, new `streaming` row; local-development.md providers table; verification.md smoke row; the stale `docs/product/todo.md` config-migration item removed.
- Verified: full `npm run verify` green; e2e 12/12; live boot checks for both the happy (fake config `/healthz`) and fatal paths. `run-local-fake.mjs` syntax-checked; its fake path is byte-identical env to the verified direct boot.

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
6. Relocate outputDeltaFlushInterval out of resumability. Its original home made sense when it governed the turn_events durable-write cadence; since the durable-log removal it is a protocol/render-cadence knob (coalesces provider text into ~4 delta events/s — fewer SSE frames, registry appends, and widget re-renders), and it is now the only resumability key that isn't about resumability. Move it to a streaming (or chat) config key in all three config files, out of SideChatResumabilityConfig into its own contract type, through both options adapters; keep the env key SIDECHAT_OUTPUT_DELTA_FLUSH_MS stable. Update the configuration.md resumability row (drop the coalescing mention story 10 added there) and any ADR-0007/vocabulary references that name its location.

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
- [ ] resumability contains only resumability knobs; the delta-coalescing window lives under its own key with an unchanged env name.

## Verification

```sh
npm test --workspace @side-chat/partner-ai-service
node scripts/run-local-fake.mjs --yes
npm run test:e2e
npm run verify
```
