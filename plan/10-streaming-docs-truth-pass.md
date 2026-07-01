# 10 — Streaming docs truth pass + dead config knobs

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** 02–09 (write docs to the final implemented state) | **Status:** todo

## Problem

The repo's flagship docs still teach the architecture deleted on 2026-06-30, including file paths that no longer exist. Verified stale surfaces:

- `README.md` — "Resumable streaming … survive reconnects, tab closes, and multi-instance deploys", "durable turn_events log is the source of truth", "LISTEN/NOTIFY fan-out, no Redis" (lines ~16-18, 66-68, 106).
- `docs/architecture/assistant-turn.md` — durable log, reaper, pruner, "reconnect from any instance", cites deleted `turn-events.ts`/`turn-reaper.ts`/`turn-pruner.ts` by path and line (~:9, :81-133).
- `docs/architecture/system-map.md` — streaming model section + package table rows describing the durable log and reaper/pruner (~:56-73, :82, :89).
- `docs/domain/vocabulary.md` — durable-log terms (~:48; audit the whole file for `turn_events`, reaper, pruner).
- `packages/db/README.md:11-24` — six deleted APIs (`appendTurnEvent`, `readTurnEventsAfter`, `pruneTurnEventsBefore`, turn-events NOTIFY channel, `createPostgresTurnEventNotificationSource`).
- `apps/partner-ai-service/src/composition/README.md:75-85` — documents `reaper, pruner` composition keys that don't exist.
- `docs/operations/configuration.md:29` — documents dead knobs as live.
- Dead config surface: `turnEventRetention`, `prunerInterval` in `sidechat.config.ts:208-225` + their env keys (`service-env-contract.ts:33-36`) + `resolveResumabilityConfig` fields nothing reads. (`reaperInterval`/`reaperBatchLimit` become LIVE again in story 05 — keep those.)
- Stale code comments: `turn-observability.ts:27-36` (`turn_reaped` type — becomes live again with story 05, verify), `turn-subscription-stream.ts:21-37` (calls the registry "the durable turn-event log"), `turn-event-dispatcher.ts` vs neighbors disagreeing.
- Stale `dist/` outputs in `packages/db` and `packages/side-chat-widget` containing deleted modules (`dist/repositories/.../turn-events.d.ts` etc.) — confusing archaeology.
- `docs/generated/partner-ai-service.openapi.generated.json` — verify the run/stream endpoints match the story-02 contract.

## Decided approach

One patch, after the Epic-1 implementation lands, rewriting every stale surface to the ADR-0010 model (connection-bound, stream-from-POST, fail-fast resume, poll fallback, reaper sweep, cancel/activity via NOTIFY). Delete the pruner/retention knobs and their plumbing. Add a short **deployment/capacity note** in `docs/operations/` (new file or a section in configuration.md): instance model (any instance serves next turn; live stream bound to the POST connection), pool sizing knob (story 26), SSE budgets, retention reality (no automatic pruning of `assistant_turns`/`usage_records`/`audit_events`; ~3.6 M rows/yr at 10 k turns/day — document, don't build).

## Tasks

1. Rewrite the streaming sections of the six docs above; keep the docs-gate header contract and paragraph-density limits (`npm run lint:custom` enforces).
2. README feature bullets: replace the multi-instance-replay claim with the honest model (also fix "shadow-DOM-isolated" → iframe-isolated here if story 14 hasn't already).
3. Delete `turnEventRetention`/`prunerInterval` end-to-end (config, env contract, resolution, types, docs).
4. Purge/update every stale comment found by: `grep -rn "reaper\|pruner\|turn_events\|durable" apps packages --include="*.ts" | grep -vi test` — each hit either true (post story 05) or rewritten.
5. Add a `clean` script or note so stale `dist/` gets rebuilt; delete tracked-stale outputs if any are tracked.
6. Regenerate/fix the OpenAPI artifact for the new POST contract.
7. Update `docs/domain/vocabulary.md`: retire durable-log terms, add "stream owner", "poll fallback", "orphan sweep" if used by the new docs.

## Acceptance criteria

- [ ] `grep -rn "turn_events" README.md docs/ packages/db/README.md` returns only historical references inside ADRs.
- [ ] Every file path cited by assistant-turn.md exists.
- [ ] `npm run verify` green (docs gate + governance fixtures).
- [ ] A newcomer reading README → system-map → assistant-turn gets only the ADR-0010 model.

## Verification

```sh
npm run lint:custom
npm run verify
```
