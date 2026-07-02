# 15 — Rename partner-ai-_ → sidechat-_

**Epic:** 2 First-run | **Priority:** P1 | **Depends on:** run LAST in epic 2; ideally after epics 1–5 (fewest open branches) | **Status:** todo

## Problem

The product, protocol, config, and env vars all say "Side Chat" (`sidechat.v1`, `sidechat.config.ts`, `SIDECHAT_*`), but the two core workspaces are `partner-ai-service` / `partner-ai-core` (`@side-chat/partner-ai-service`, `@side-chat/partner-ai-core`). Grep for either term finds half the system; newcomers ask what "partner" means (nothing — it's a leftover). This is a template meant to be copied; the window to rename is **now**, before internal versioning starts.

## Decided approach

Full rename to the product name:

- `apps/partner-ai-service` → `apps/sidechat-service`, package `@side-chat/sidechat-service`… note the scope already says side-chat, so prefer `@side-chat/service` and `@side-chat/core` for the final names (owner may veto; confirm before executing).
- `packages/partner-ai-core` → `packages/core` (`@side-chat/core`).
- Identifiers: `PartnerAiServiceOptions` → `SideChatServiceOptions`, `composePartnerAiService` → `composeSideChatService`, `createPartnerAiService*` builders, `partnerAiCore*` exports — mechanical rename, final state, no aliases (AGENTS.md final-state rule).
- Docs/gate scripts: the boundary matrices in `scripts/check-boundaries.mjs`, `check-dependency-policy.mjs`, `check-runtime-boundaries.mjs` name the old package names — update the allow/deny tables; `check-governance-fixtures.mjs` fixtures may embed names too.
- The generated OpenAPI file name (`docs/generated/partner-ai-service.openapi.generated.json`) and `docs/` references.

## Tasks

1. Confirm final names with the owner (one question: `@side-chat/service`+`@side-chat/core` vs `@side-chat/sidechat-service`+`-core`).
2. Rename directories + package names + tsconfig project references + root `tsconfig.json` paths + vitest/playwright configs + workspace scripts (`db:reset` path in root package.json, `run-local-fake.mjs` BACKEND_WORKSPACE, `dev.mjs`).
3. Repo-wide identifier rename (`grep -rn "PartnerAi\|partner-ai\|partnerAi"` until zero hits outside git history/ADRs; ADRs keep historical names with a note).
4. Update every gate script table; run the meta-gate.
5. Update docs (system-map package table, package-boundaries matrix, extension-seams, vocabulary if it names packages).

## Acceptance criteria

- [ ] `grep -rin "partner" --include="*.ts" --include="*.mjs" --include="*.json" apps packages scripts test-harness` → zero hits (excluding lockfile regeneration noise).
- [ ] `npm run verify` green including all 14 gates and the governance meta-fixtures.
- [ ] `npm run dev` and `run-local-fake.mjs` boot; e2e green.

## Verification

```sh
npm run verify
npm run test:e2e
node scripts/run-local-fake.mjs --yes
```
