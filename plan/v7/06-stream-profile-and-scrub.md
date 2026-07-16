# Step 06: Stream Profile and Scrub Filter

Read this when: implementing the Side Chat profile of the UI message stream — error vocabulary, `data-*` parts, and the outbound policy filter.

Source of truth for: the scrub filter, the profile document, and the wire-level privacy contract.

Not source of truth for: which `data-*` parts exist (Step 01 owns the inventory) or reconnect mechanics (Step 07).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 05. Unblocks: Steps 07, 08, 14.

## Outcome

One small transform in Step 05's `outboundTransforms` seam enforces product policy on every outbound chunk, and the profile document makes "UI message stream v1 + Side Chat parts" the written public contract. Target size for the filter: ≤ ~200 lines — it replaces the old ~2,850-line double mapping and must not grow back into a vocabulary translator.

## Old-app reference (the narrowing rules to preserve)

`packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts`: content-filter finish → blocked (not completed); step-limit finish → length semantics; internal error codes collapse to a generic provider failure unless allowlisted; `retryable` flag rules; nothing emitted after a terminal. Error vocabulary source: `packages/chat-protocol/src/sidechat-v1/errors.ts` filtered by the Step 01 decision.

## Target design

### Scrub filter (TransformStream over `UIMessageChunk`)

- **error parts**: replace message text with the Step 01 vocabulary mapping; unknown/internal → generic provider-failure code; attach `retryable` per the old allowlist; raw provider text never passes;
- **content filter**: map the native finish/blocked representation to the Step 01-decided blocked semantics (verify the native finish-reason values on the pinned version before inventing a part);
- **step limit**: map to length semantics if the native finish reason differs (verify first);
- **`data-*` merge**: inject the sanctioned parts (Step 01 inventory) via `createUIMessageStream` composition where the server adds them (e.g. turn status), keeping injection ordered relative to native parts;
- **forward-compatibility**: unknown chunk types are **forwarded, not dropped**, and counted in telemetry;
- **terminal guard**: assert-once semantics — a second terminal-class chunk is dropped and counted (defense in depth; the SDK should already guarantee this).

### Profile package + document

Create the shared profile package (`packages/stream-profile`, final name recorded here; see `ARCHITECTURE.md` §Package boundaries): dependency-free and browser-safe, exporting our `data-*` part types and the error-code vocabulary with retryability — imported by BOTH this service's scrub/injection code and the widget (Steps 13/14). This is the shrunken successor of `chat-protocol`'s legitimate shared-contract role; keep it to type declarations plus the vocabulary table, no runtime machinery.

Write the canonical profile doc (placement per docs policy; linked from Step 21): pinned protocol version (`x-vercel-ai-ui-message-stream: v1`), our `data-*` part schemas (referencing the package as their source of truth), the error-code vocabulary with retryability, the auth/transport contract (headers, cancel/reconnect routes), and the keepalive note (comment frames, interval).

## Edge cases (each a test)

1. scripted raw provider error message (sentinel string) never appears in any outbound chunk;
2. content-filter finish produces the blocked representation, and the turn's persisted status matches;
3. unknown chunk type passes through untouched and increments the counter;
4. injected `data-*` part arrives with correct ordering relative to text parts;
5. double-terminal defense: a synthetic second finish is dropped and counted;
6. every code in the Step 01 vocabulary has a mapping test (exhaustive table—a new code fails compilation/test until mapped).

## Verification

```powershell
npm test -- apps/side-chat-service/src/adapters/http
npm run typecheck
npm run lint:custom
rg -n "sidechat\.v1" apps/side-chat-service
```

Zero matches for the `rg`.

## Completion checklist

- [x] Filter in the Step 05 seam, ≤ ~200 lines, exhaustive vocabulary table.
- [x] All six edge cases tested, sentinel privacy test included.
- [x] Profile doc written and linked; protocol version pinned in it.

## Handoff record

Filter module and line count: `apps/side-chat-service/src/application/turn/stream/scrub-filter.ts` (~90 lines). Wired as a per-request `OutboundTransformFactory` in both route compositions (the Step 05 seam type became a factory list because a `TransformStream` instance is single-use).

Profile doc location: `docs/architecture/stream-profile.md`. Shared vocabulary package: `packages/stream-profile` (`@side-chat/stream-profile`, dependency-free, browser-safe) — exhaustive `SIDE_CHAT_ERROR_VOCABULARY` (compile-time total via `Record`), empty `SideChatDataParts` extension point, pinned `SIDE_CHAT_STREAM_PROTOCOL`.

Native finish-reason findings (blocked/step-limit): on the pinned SDK, native `FinishReason = stop | length | content-filter | tool-calls | error | other`. **content-filter = blocked; length = truncated output.** ADR 0007 adds no custom "blocked" code, so the blocked/length representation IS the native `finish` part's `finishReason` (verified: `@ai-sdk/workflow` `to-ui-message-chunk.ts:227` emits a **bare** `{type:'finish'}` — the reason survives only in the run's terminal outcome, so the workflow adapter re-attaches it onto the finish chunk, and the persisted terminal records it). The scrub filter forwards the reason untouched; it does not remap.

Deviations from the step text (approved): (1) Step 05 had shipped a lossy `TurnOutputEvent` double-mapping shadow vocabulary; it was **removed** so `TurnExecution` streams native `UIMessageChunk` and the scrub filter is the single edge transform (user-approved 2026-07-11). (2) The `data-*` "turn status" example is superseded by ADR 0007's zero-baseline-parts decision (Step 01 owns the inventory); the injection **seam** is built and tested (`chat-stream-response.test.ts`), but no baseline part ships. (3) In-stream errors collapse to the generic `provider_failed`; precise classification (timeout/internal) stays in the persisted terminal. (4) The scrub filter exposes a `ScrubObserver` seam for the unknown/dropped counters; wiring it to `TelemetrySink` is deferred to Step 18 (which owns telemetry completion).
