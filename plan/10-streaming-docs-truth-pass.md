# 10 — Post-implementation docs delta + dead knobs + stale code comments

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** 02–09 | **Status:** done (2026-07-02)

## Delivery notes

- **Dead knobs deleted end-to-end:** `turnEventRetention` + `prunerInterval` config entries (all three config files), `SIDECHAT_TURN_EVENT_RETENTION_MS`/`SIDECHAT_PRUNER_INTERVAL_MS` env keys, `TURN_EVENT_RETENTION_MS`/`PRUNER_INTERVAL_MS`/`PRUNER_BATCH_LIMIT` catalog defaults, the `ResumabilityConfig`/`Options`/`SideChatResumabilityConfig` fields, both resolvers (readable-config + legacy env), and every test reference. `reaperInterval`/`reaperBatchLimit` stayed (live since `plan/05`). configuration.md's resumability row no longer flags a known gap.
- **Stale-comment purge:** every `turn_events`/`durable log`/`pruner` mention in prod code is now either rewritten to the registry model (routes, subscription stream, resolvers, widget client comments, core drain docs) or an explicitly historical reference to the deleted design (the registry's terminal-guard comment, composition's "no durable log" contrast). The docs-app glossary's flat-wrong "durable turn-event log is the source of truth" entry was replaced with a turn-event-registry entry.
- **Docs delta (tasks 3–4):** already landed incrementally with stories 02–09 (assistant-turn HTTP table, transport docs, OpenAPI additions per story) — verified current; nothing further needed.
- **Capacity note (task 5):** new `docs/operations/capacity-and-deployment.md` — instance model, 3 dedicated LISTEN connections per instance, SSE budgets + the 30 s silent host-command pause vs proxy idle timeouts (until `plan/17`), the grows-forever table with the ~3.6 M rows/yr math, and the deliberate non-persistence of tool/activity detail (`tool_invocations` reserved, owner decision). Indexed in docs/README.
- **Clean script (task 6):** `npm run clean` (`scripts/clean-dist.mjs`) removes all workspace dist/tsbuildinfo; ran it + rebuilt — the stale `turn-pruner.d.ts` ghosts are gone; dist is gitignored so nothing was ever tracked.
- **Out of scope, flagged as a chip:** seven `apps/docs` (Fumadocs showcase) content pages still describe the durable-log design — a full content rewrite spun off as its own task.
- Acceptance greps clean: `turn_events` appears only in ADRs/plan/generated-schema; the comment grep returns only true statements; verify green.

## Scope change

The full docs truth pass originally planned here was executed early, together
with story 01 (see `plan/01`): ADRs rebaselined, all `docs/` architecture/
operations/product files, both stale package READMEs, and the root README now
describe the current connection-bound code, with known gaps flagged inline.

What remains for this story is the **code-side** cleanup and the **delta** pass
after stories 02–09 change behavior.

## Remaining tasks

1. **Delete the dead config knobs** end-to-end once story 05 reconnects the
   reaper ones: `turnEventRetention` and `prunerInterval` in
   `apps/partner-ai-service/sidechat.config.ts` (~:208-225), their env keys in
   `service-env-contract.ts`, and the unread fields in
   `resumability-resolution.ts` / composition types. (`reaperInterval` and
   `reaperBatchLimit` become live again in story 05 — keep those.) Update the
   flagged row in `docs/operations/configuration.md` to match.
2. **Purge stale code comments** that still assert the deleted design:
   `grep -rn "reaper\|pruner\|turn_events\|durable" apps packages --include="*.ts" | grep -vi test`
   — each hit must be true (post story 05) or rewritten. Known offenders:
   `turn-cancel-notification-source.ts:22-23`, `packages/db/src/schema-contract/lifecycle.ts:56-58`,
   `schema-contract/repositories.ts` (reaper doc block),
   `turn-subscription-stream.ts:21-37` ("durable turn-event log"),
   `turn-observability.ts:27-36` (`turn_reaped` — becomes live with story 05, verify).
3. **Docs delta after 02–09:** update `assistant-turn.md` (HTTP surface section:
   two calls → stream-from-POST), `runtime-and-protocol-events.md` (transport
   open section + identity frame if added), `system-map.md` streaming table,
   and remove the known-gap callouts that stories 04/05/06/07 close.
4. **Regenerate/fix the OpenAPI artifact** (`docs/generated/partner-ai-service.openapi.generated.json`)
   for the story-02 POST contract and any new/changed routes.
5. **Write the capacity/deployment note** in `docs/operations/` (new file or a
   configuration.md section): instance model (any instance serves the next
   turn; live stream bound to the starting connection), pool sizing knob
   (story 26), SSE connection budgets, heartbeats (story 17), and retention
   reality (NOTHING is ever cleaned: `assistant_turns`, `messages`,
   `usage_records` [one row per runtime step], `turn_context_snapshots`,
   `audit_events`, and post-story-08 `host_command_results` all grow forever;
   ~3.6 M turn rows/yr at 10 k turns/day — document, don't build). Also state
   the deliberate non-persistence: tool/activity detail (inputs, results,
   reasoning rows) lives only in the in-memory registry and is gone after a
   reload — `tool_invocations` is the reserved-but-unwritten table if the
   product ever wants persistent tool cards in history (owner decision, not
   scheduled).
6. Add a `clean` script (or wire into `build`) so stale `dist/` output from
   deleted modules gets rebuilt; verify no tracked stale artifacts remain.

## Acceptance criteria

- [ ] `grep -rn "turn_events" README.md docs/ packages/db/README.md` returns only historical references inside ADRs and plan/.
- [ ] The comment grep in task 2 returns only true statements.
- [ ] No config key resolves into a struct nothing reads (task 1).
- [ ] OpenAPI matches the shipped routes.
- [ ] `npm run verify` green (docs gate + governance fixtures).

## Verification

```sh
npm run lint:custom
npm run verify
```
