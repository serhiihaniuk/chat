# 35 — Core tree flattening + naming de-collisions + dead vocabulary

**Epic:** 7 Readability | **Priority:** P2 | **Depends on:** run after epics 1–5 (touches many files; avoid conflicts) | **Status:** todo

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

- [ ] Core ≤ ~20 directories; no same-name file/folder siblings; observability in one place.
- [ ] `grep -rn "ToolCatalog\|toSidechatId\|event_log_conflict" packages apps` → zero production hits.
- [ ] `UserMessageId` is not assignable to `AssistantMessageId` (type-level test).
- [ ] All tests green with zero behavior-diff (this story adds none except the brand-type test).

## Verification

```sh
npm run typecheck
npm test
npm run lint:custom
npm run verify
```
