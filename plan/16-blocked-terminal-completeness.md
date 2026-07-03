# 16 — sidechat.blocked completeness + schema honesty

**Epic:** 3 Protocol | **Priority:** P0 | **Depends on:** — | **Status:** done

## Problem

The two-session-old "blocked-terminal rollout gap" is still open, and the pattern behind it (N sync points, no completeness gate) is the structural risk:

1. `validateSidechatEventSequence` rejects `sidechat.blocked` as "unsupported" terminal (`packages/chat-protocol/src/sidechat-v1/ordering/sequence.ts:42-47`) while `isTerminalEvent`/`TerminalEvent` (`events/event-union.ts:165,183-186`), the per-event validator, codec, core, and widget all accept it. A legal blocked stream fails the package's own exported validator; tests cover only completed (`ordering/sequence.test.ts`).
2. The "generated" schema has **no generator** (nothing in `scripts/` or any package.json produces it) and has drifted: `src/generated/sidechat-v1.schema.generated.json` omits `sidechat.blocked` from the type enum (~:93-100) and the `oneOf` (~:127-134), has no BlockedEvent def; the published OpenAPI references it. The gate `scripts/check-generated-artifacts.mjs:8-30` checks only existence + a header comment.
3. `@side-chat/testing` has zero consumers and carries a third divergent terminal check: `assertTerminalStream` = `completed || error` (`packages/testing/src/index.ts:66-73`).
4. `EVENT_PAYLOAD_VALIDATORS` is `satisfies Record<string,…>` — a missing event key compiles (`validation/validation.ts:118-126`). Inline enum arrays shadow the exported constants (`validation.ts:91,106,132,135,240`).
5. Core persists a blocked terminal as `provider_failed` status — a safety stop is indistinguishable from a provider outage in the DB (`packages/partner-ai-core/.../finalization/protocol-event-accumulator.ts:96-103`; asserted at `stream-chat.test.ts:350`).

## Decided approach

1. Delete the terminal-type restriction in `sequence.ts` (terminality is owned by `isTerminalEvent`); add a blocked-terminated fixture stream test.
2. **Completeness test** in chat-protocol asserting: (a) `Object.values(SIDECHAT_EVENT_TYPES)` === the schema's event-type consts/oneOf set; (b) every `TerminalEvent` member passes `validateSidechatEventSequence`; (c) round-trips through both codecs for every event type (builders exist in tests already).
3. Schema honesty: no generator exists, so **rename** to `sidechat-v1.schema.json` (drop "generated"), update its header to "hand-maintained, parity-enforced by <test path>", update `check-generated-artifacts.mjs` expectations, and add BlockedEvent (+ `reason`, `publicMessage`) to it. (If the owner prefers a real generator later, the parity test makes that a safe refactor.) Update the OpenAPI artifact reference.
4. Tighten `EVENT_PAYLOAD_VALIDATORS` to `satisfies Record<SidechatEventType, …>`; derive inline enum arrays from the exported constants (`Object.values(SIDECHAT_BLOCKED_REASONS)` etc.).
5. `@side-chat/testing`: **dogfood or delete.** Decision: dogfood — fix `assertTerminalStream` to delegate to `isTerminalEvent`, add a usage example to its README, and convert at least the widget-harness's local builders to consume it. If that conversion turns out large, delete the package instead (final-state rule) — decide in-story, note the choice.
6. Add a distinct `blocked` member to the assistant-turn failure statuses so audits can distinguish safety stops (db `ASSISTANT_TURN_STATUSES` + check constraint via `db:generate`, accumulator mapping, contract tests, widget/status consumers). Coordinate with story 19 (widget rendering of blocked).
7. If story 02 added an identity frame/event, cover it in the completeness test.

## Acceptance criteria

- [x] A blocked-terminated stream passes `validateSidechatEventSequence` (test).
- [x] The completeness test fails if any event is added to the union but not the schema/sequence/codecs (prove by temporarily adding a dummy event).
- [x] No file named `*.generated.*` lacks a producing generator (gate updated).
- [x] `assertTerminalStream` recognizes blocked; `@side-chat/testing` has ≥1 real consumer or is deleted.
- [x] Blocked turns persist with status `blocked`, not `provider_failed` (db + core tests updated).

## Delivery notes (2026-07-03)

- **Sequence validator**: `ordering/sequence.ts` no longer restricts terminals to completed/error — terminality is delegated entirely to `isTerminalEvent`. Added a blocked-terminated stream test to `sequence.test.ts`.
- **Completeness gate**: new `src/sidechat-v1/protocol-completeness.test.ts` holds one fixture per event type in `EVENT_FIXTURES: Record<SidechatEventType, SidechatStreamEvent>` (compile lock) and asserts schema base-enum parity, one schema def per type pinned by its `type` const, blocked-reason enum parity, every terminal member passing `validateSidechatEventSequence`, and SSE codec round-trips. Drift proven: a temporary dummy union member produced 5 test failures + 2 compile errors.
- **Schema honesty**: no generator ever existed, so the schema was renamed `src/generated/sidechat-v1.schema.generated.json` → `src/sidechat-v1.schema.json` with a "hand-maintained, parity enforced by protocol-completeness.test.ts" header, and gained the BlockedEvent def (base type enum, oneOf, `reason`/`publicMessage`). Same treatment for `docs/generated/partner-ai-service.openapi.generated.json` → `docs/partner-ai-service.openapi.json` ($ref updated). `check-generated-artifacts.mjs` was rewritten around a `REGISTERED_GENERATORS` map (currently empty): any `*.generated.*` file without a registered producer fails the gate; `check-governance-fixtures.mjs` proves it.
- **`@side-chat/testing`: deleted** (final-state rule — zero consumers; dogfooding would have manufactured a consumer just to keep a third terminal check alive). References removed from tsconfig path mappings/refs, `check-boundaries.mjs`, `check-dependency-policy.mjs`, and docs (package-boundaries, verification, system-map).
- **Validator table tightening**: `EVENT_PAYLOAD_VALIDATORS` is now `satisfies Record<SidechatEventType, …>`; inline enum arrays derive from the exported constants (`SIDECHAT_BLOCKED_REASONS`, `ACTIVITY_KINDS`, `ACTIVITY_STATUSES`).
- **Distinct `blocked` status**: added to db `ASSISTANT_TURN_STATUSES` (check constraint regenerated in `0000_day_one.sql`) and core `AssistantTurnFailureStatus`. `protocolTerminalErrorCode` was replaced by `protocolTerminalFailure` returning `{status, errorCode}` — a blocked terminal persists as status `blocked` with the blocked reason (`content_filter`/`safety_policy`) as its error code; `failAssistantTurn`'s `errorCode` widened to `ProtocolErrorCode | SidechatBlockedReason`. Core + db contract tests updated.
- **Gotcha for future db enum edits**: drizzle-kit resolves `#schema-contract` through `dist/` (no "development" condition), so `npm run db:generate` silently uses a stale build — rebuild `packages/db` first or the regenerated constraint keeps the old value list.
- Verification: chat-protocol/core/db/service suites green (358 + 189 tests), `npm run verify` clean, e2e 12/12. `test:db:container` still deferred — Docker unavailable (standing chip).

## Verification

```sh
npm test --workspace @side-chat/chat-protocol
npm test --workspace @side-chat/partner-ai-core
npm run db:generate && npm run test:db:container   # if status enum changed
npm run verify
```
