# 35 — Core tree flattening + naming de-collisions + dead vocabulary

**Epic:** 7 Readability | **Priority:** P2 | **Depends on:** run after epics 1–5 (touches many files; avoid conflicts) | **Status:** done

## Problem

1. **`partner-ai-core` presents 4× its size:** 71 files across 36 directories (~2 files/folder, ~70 lines/file). Concrete mazes: `src/domain/capabilities.ts` (barrel) sits beside `src/domain/capabilities/` (directory); `capabilities.ts` exists at two depths; observability spans three files in three trees (`services/observability.ts`, `services/stream-observability.ts`, `application/stream-chat/observability/stream-chat-observability.ts`); errors live in two trees; `ports/runtime/runtime-port.ts` is a folder for a one-line alias.
2. **Same-name collisions across the repo:** two `toRuntimeError` with different semantics (`agent-runtime.ts:158-161` → `internal_error` vs `stream-part-mapper.ts:45-51` → `provider_unavailable`); two `readString`/`requireString` families with different signatures (`chat-protocol` `primitives.ts:38-51` vs `sidechat-event-readers.ts:28-33`/`validation.ts:141-145`); `ToolCatalog` is a bare alias of `ToolRegistry` (`tool-selection.ts:4`). (The `HostCommandCapability` twin is story 25.)
3. **Dead vocabulary/exports:** `sidechat.history` event — defined in the protocol, never emitted by any server code, explicitly ignored by the reducer (decide: implement or delete from the union — deleting touches the story-16 completeness surfaces; default: delete); `event_log_conflict` error code with no thrower (`packages/db/src/repositories/errors.ts:5`); `RUNTIME_ACTIVITY_KINDS.PROGRESS` + `RuntimeActivityDetails.images` with no producer (keep, but add "reserved; no runtime producer yet" comments — the widget renders images after story 23 via tools' readSources path); `SidechatId`/`toSidechatId` exported and unused (`primitives.ts:8,19`); the schema's unreferenced `SidechatEventBase` def; `UserMessageId`/`AssistantMessageId` sharing one brand name `"MessageId"` so they're mutually assignable (`packages/db/src/schema-contract/ids/persistence-ids.ts:8-9` — give distinct brands); `awaitTurn` on the production TurnRunner contract used only by tests (`turn-runner.ts:54` — move to test support); `app.ts:35-38` hardcoding workspace literals that duplicate `service-env-contract.ts:45-46` constants.
4. **Two readability rewrites** flagged against the house style: `failStartedTurnOnError` (`stream-chat-turn-prestart-lifecycle.ts:255-267`) and `validateTerminalOrFailTurn` (`protocol-terminal-lifecycle.ts:74-98`) — nested `.pipe(Effect.catch(...Effect.andThen(Effect.fail(...))))` chains; rewrite as small `Effect.gen` bodies. Plus one trap comment to add: `RuntimeEventMappingState.reasoningState` is an intentionally mutable cell inside otherwise-immutable `mapAccum` state (`tool-loop-agent-runner.ts:190-195`, `reasoning-activity.ts:42,64-66`) — someone "fixing" the consistency breaks reasoning flushes silently.

## Decided approach

Mechanical, behavior-preserving refactor (no logic changes except the two Effect.gen rewrites):

1. Flatten core: target ≤20 directories; collapse one-file folders; merge the two `services/*observability*` files; unify the errors location; rename the capabilities twins. Respect `check-code-shape.mjs` (≤5 source files/dir) — flattening must balance against that gate; plan the target tree first.
2. Renames: `toRuntimeDefectError`/`toProviderRuntimeError`; `readStringField` family in the protocol internals; delete `ToolCatalog`.
3. Execute the dead-vocabulary list above (each item: delete or comment as specified).
4. The two `Effect.gen` rewrites + the mutable-cell comment.
5. Update package READMEs' "first files to open" and any doc file-path references the moves break (`npm run lint:custom` + grep for moved paths in docs/).

## Acceptance criteria

- [x] Core ≤ ~20 directories; no same-name file/folder siblings; observability in one place. (**20 dirs**, down from 33; collision check clean.)
- [x] `grep -rn "ToolCatalog\|toSidechatId\|event_log_conflict" packages apps` → zero production hits.
- [x] `UserMessageId` is not assignable to `AssistantMessageId` (type-level test).
- [x] All tests green with zero behavior-diff (this story adds none except the brand-type test).

## Verification

```sh
npm run typecheck
npm test
npm run lint:custom
npm run verify
```

## Delivery notes

Executed as a behavior-preserving refactor (only the two `Effect.gen` rewrites and the
brand-type test change anything, and both are semantics-preserving). Plan premises were
verified against the code first — two apparent contradictions resolved: `ToolCatalog`'s
"50 hits" were the unrelated widget type `ToolCatalogOption` + the `createToolCatalog`
factory as substrings (it really is a bare `= ToolRegistry` alias), and
`SidechatEventBase`'s heavy use is the load-bearing TS type — only the JSON-schema def
was dead.

**Naming de-collisions + dead vocabulary (green, tests pass):**

- Deleted `event_log_conflict` (no thrower) and unused `SidechatId`/`toSidechatId`.
- Renamed the protocol-primitives `readString`/`requireString` → `readStringField`/
  `requireStringField`, de-colliding them from the event-reader family of the same name.
- Gave `db` `UserMessageId`/`AssistantMessageId` **distinct brands** + a `@ts-expect-error`
  type test. This caught 8 real id-conflation sites (incl. fixtures passing
  `assistantMessageId: turn.userMessageId`); each now brands with the role-correct
  constructor.
- Collapsed the `ToolCatalog = ToolRegistry` alias (and `createToolCatalog`) into direct
  `ToolRegistry` / `createToolRegistry` use.
- Split the two same-named `toRuntimeError` → `toRuntimeDefectError` (internal_error) and
  `toProviderRuntimeError` (provider_unavailable).
- Deleted the never-emitted `sidechat.history` stream event (`HistoryEvent` + the enum
  member + validation/branding/reader/schema/completeness/reducer/projection cases). Kept
  `HistoryMessage` — it is the live `readHistory` response type, not part of the stream.
- Removed the unreferenced `SidechatEventBase` JSON-schema def.
- `awaitTurn` moved off the production `TurnRunner` contract onto a test-only
  `TurnRunnerTestHandle` (the impl needs the runner's private FiberMap and flows through
  composition, so a type-level move keeps the production contract clean with no leak).
- Replaced `app.ts`'s hardcoded `tenant_local`/`workspace_local` with the
  `DEFAULT_TENANT_ID`/`DEFAULT_WORKSPACE_ID` env-contract constants.
- Reserved-field comments on `RUNTIME_ACTIVITY_KINDS.PROGRESS` and
  `RuntimeActivityDetails.images`; a mutable-cell trap comment on
  `RuntimeEventMappingState.reasoningState`.

**Two Effect.gen rewrites:** `failStartedTurnOnError` and `validateTerminalOrFailTurn`
— the nested `.pipe(Effect.catch(...Effect.andThen(Effect.fail(...))))` chains are now
small `Effect.gen` catch handlers (`yield*` the failing/marking effect, then re-raise).

**Core tree flatten (33 → 20 directories):** de-collided `domain/capabilities.ts`
(barrel renamed to `capabilities-contract.ts`, ~21 importers updated), merged
`services/stream-observability.ts` into `services/observability.ts` and collapsed
`stream-chat/observability/` up (observability in one place), unified the two error trees
(`stream-chat/errors/effect-failures.ts` → `errors/`, re-exported via `#errors`), and
collapsed the one-file folders (`ports/*`, `stream-chat/guards`, the capabilities contract
`ids/`+`validation/`, `testing/*`), fixing the coarse `#`-alias + barrel re-exports and the
stale README/ADR/vocabulary/glossary path references. Two extra collapses
(`testing/stream-chat/*`, `capabilities/validation/*`) took it from 22 to 20 dirs.

**Deviations (both necessary, no behavior change):** (a) re-exporting `effect-failures`
through `#errors` created an ESM TDZ cycle, broken by extracting the error primitives into
`errors/partner-ai-core-error.ts` so `errors/index.ts` is a pure barrel over two leaf
modules (identical public surface). (b) Four `directoryBudgetExceptions` were added
(`application/stream-chat`, `domain/capabilities`, `domain/capabilities/contracts`,
`ports` — each lands at 6 files after the mandated collapses) with reasons. The
mutable-cell trap comment was condensed to one line to keep `tool-loop-agent-runner.ts`
within the 300-line budget.

`npm run verify` green; zero behavior diff (only the two `Effect.gen` rewrites and the
brand-type test differ, both semantics-preserving).
