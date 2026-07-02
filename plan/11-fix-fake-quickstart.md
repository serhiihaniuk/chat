# 11 — Fix the fake-provider quick start

**Epic:** 2 First-run | **Priority:** P0 | **Depends on:** — | **Status:** todo

## Problem (verified by execution 2026-07-01)

The README's advertised no-API-key first command crashes at boot:

- `node scripts/run-local-fake.mjs --yes` (fake mode) sets `SIDECHAT_PROVIDER=fake` but no `SIDECHAT_CONFIG_PATH` (`scripts/run-local-fake.mjs:712-726`).
- `server.ts` boots config-first: `loadSelectedSideChatConfig()` imports `apps/partner-ai-service/sidechat.config.ts`, which declares **OpenAI models only** (`sidechat.config.ts:61-104`).
- `readProviderKindForConfig` derives the provider from the declared models — `SIDECHAT_PROVIDER` is ignored by this path (`config/sidechat-config/validation.ts:31-40`).
- `createRuntimeConfig` then requires the key unconditionally (`options/options-adapter.ts:104-109`). Reproduced: `BOOT FAILS: SIDECHAT_OPENAI_API_KEY is required when sidechat.config.ts enables OpenAI models.`
- The legacy env parser that understands `fake` is only reached if the config _import_ fails (`selection/config-selection.ts:41-58`).

An Azure sibling already solves this correctly: azure mode boots a standalone config via `SIDECHAT_CONFIG_PATH` (`run-local-fake.mjs:730`).

## Decided approach

Follow the Azure pattern — make fake mode config-driven, not env-hack-driven:

1. Add a fake-provider config: either a `sidechat.fake.config.ts` next to the Azure one, or (preferred, more discoverable) a named entry in a `SIDECHAT_CONFIGS` registry export in the main `sidechat.config.ts` (`{ default: openaiConfig, fake: fakeConfig }` — the selection mechanism already supports registries via `SIDECHAT_CONFIG=<name>`, `config-selection.ts:26-39`).
2. The fake config declares the fake provider's models (see `PROVIDERS.FAKE` in `apps/partner-ai-service/src/config/catalog/providers.ts`) so `readProviderKindForConfig` hits the FAKE branch (`options-adapter.ts:86-98` — already correct: no key required, production-profile guarded).
3. `run-local-fake.mjs` fake mode sets `SIDECHAT_CONFIG=fake` (or `SIDECHAT_CONFIG_PATH` to the standalone file). Remove the now-dead `SIDECHAT_PROVIDER` injection if nothing on the config path reads it (the legacy parser still does until story 12 — keep it until then, then delete).
4. Verify the widget-harness local-service mode and the adoption harness also boot fake this way.

## Tasks

1. Write the fake config (models, mock tool, dev profile expectations); keep secrets out.
2. Wire the launcher; run `node scripts/run-local-fake.mjs --yes` end-to-end on a clean env (no `SIDECHAT_OPENAI_API_KEY`) and send a message in the browser.
3. Add a boot test: options-from-config with the fake selection builds without any provider secret env (unit test over `createPartnerAiServiceOptionsFromConfig`).
4. Update `docs/operations/local-development.md` if the invocation or env story changed.

## Acceptance criteria

- [ ] Fresh clone + `npm install` + `node scripts/run-local-fake.mjs --yes` with NO provider env vars boots both servers and streams a fake answer in the browser.
- [ ] Unit test locks the no-secret fake boot.
- [ ] Azure and OpenAI launcher modes still work (smoke: config selection resolves; OpenAI still requires the key with the same clear error).

## Verification

```sh
node scripts/run-local-fake.mjs --yes    # manual, on a clean shell
npm test -- options-adapter
npm test -- config-selection
npm run verify
```
