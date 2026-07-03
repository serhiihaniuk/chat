# 18 — Runtime abort mapping + single-terminal enforcement

**Epic:** 3 Protocol | **Priority:** P1 | **Depends on:** — | **Status:** done

## Problem

Four defects at the AI-SDK → RuntimeEvent boundary (`packages/agent-runtime`):

1. **A caller-aborted turn ends with no terminal event.** The pinned `ai@6.x` has no `'abort'` finish reason (its `FinishReason` union: stop/length/content-filter/tool-calls/error/other) — the `AI_SDK_FINISH_REASON_ABORT` constant and its branch are dead code (`src/runtime/ai-sdk/streaming/stream-part-mapper.ts:16,140`). What the SDK actually does on abort is enqueue `{type:"abort"}` and close without a finish part; the mapper drops `abort` parts (`:128`), so the stream just ends — no `runtime.completed(finishReason: ABORTED)`, violating the contract's own terminal taxonomy (`packages/ai-runtime-contract/src/index.ts:157-161`). The main app is shielded only by accident (fiber interruption); any adopter using the public `abortSignal` gets a terminal-less stream.
2. **Two terminals possible:** an in-band `error` part maps to `runtime.error` but mapping continues; the SDK sets the step finish reason to `error`, and `mapFinishReason` maps `error`/`other`/`tool-calls` to STOP (`stream-part-mapper.ts:138-142`) — emitting `runtime.completed(stop)` after `runtime.error`. Core's state machine happens to shield the browser; the runtime contract doesn't uphold its own shape for direct consumers.
3. **Silent drops with no backstop:** ~14 part types fall through `return undefined` (`stream-part-mapper.ts:128`, `tool-activity-mapper.ts:55`) with no exhaustive switch or log — a future SDK pin's new part type vanishes with zero signal (this pin already added `tool-output-denied`).
4. **Cross-kind tool name collision is silent:** `mergeToolSets` spreads host-command tools over app tools (`tool-loop-agent-runner.ts:115-122`) — a browser-supplied host command named like a registered runtime tool silently replaces it, and `isHostCommandToolPart` then reclassifies every part with that name.
5. Abort fidelity asymmetry: an `AbortError` during stream open/iteration maps to `provider_unavailable, retryable: true` (`tool-loop-agent-runner.ts:105,178`) instead of aborted.

## Decided approach

1. Map `part.type === "abort"` → `runtime.completed` with `RUNTIME_FINISH_REASONS.ABORTED`; delete the dead finish-reason constant/branch. Test: scripted model + abort signal mid-stream (the scripted model already supports abort — `testing/scripted-language-model.ts:210-231`).
2. End the runner stream at the first terminal: `Stream.takeUntil(isRuntimeTerminalEvent)` (helper exists in the contract, `index.ts:272-275`); stop mapping finish-reason `error` to STOP (map it to nothing — the error part already produced the terminal).
3. Explicit ignore-set for deliberately dropped part types + a `default` that logs/traces unknown types once per turn.
4. `mergeToolSets`: fail the request (typed `AiRuntimeError`, e.g. `tool_conflict`) on a name collision between runtime tools and host commands.
5. Abort-aware error mapping: check `signal.aborted`/`AbortError` in the stream-open catch → aborted terminal, `retryable: false`.
6. Also fix: OpenAI adapter must omit `reasoningEffort` for non-reasoning selections like Azure does (`openai-model-provider.ts:90-97` vs `azure-openai-model-provider.ts:123-130`) — a non-reasoning model currently gets a 400 with no hint.

## Acceptance criteria

- [x] Abort mid-stream yields exactly one `runtime.completed(aborted)` (test).
- [x] Error-then-finish yields exactly one terminal (`runtime.error`) — test the double-terminal repro.
- [x] An unknown part type logs once and is dropped; every known type is either mapped or in the ignore-set (exhaustiveness helper/test).
- [x] Host command named like a runtime tool → typed failure, not silent override (test).
- [x] OpenAI non-reasoning model selection sends no reasoning option (wire-body test, like the existing Responses-body tests).

## Delivery notes (2026-07-03)

- **Abort terminal.** The SDK's `abort` part now maps to `runtime.completed(aborted)` in `stream-part-mapper.ts` (the dead `AI_SDK_FINISH_REASON_ABORT` constant/branch is gone — `ai@6` has no `abort` finish reason). An integration test confirms the SDK emits an `abort` part when a scripted model is aborted mid-stream, yielding one aborted completion.
- **Abort-aware error mapping.** `toRuntimeError` classifies an `AbortError` (open or iteration) as the `aborted` code with a public-safe message, never `provider_unavailable, retryable: true`.
- **Single terminal.** The runner ends at the first terminal via `Stream.takeUntil(isRuntimeTerminalEvent)`, and the mapper drops an `error` finish reason (never a second `completed(stop)`). The double-terminal repro (in-band `error` then an errored `finish`, via a new `createErrorThenFinishProvider`) yields exactly one `runtime.error`.
- **Exhaustive part classification.** New `classifyAiSdkPart` is backed by `Record<AiSdkPartType, "mapped"|"ignored">` — exhaustive by construction, so a future SDK pin's new part type fails to compile until classified. (The compile lock immediately caught `tool-approval-request`, which my hand-extraction had missed.) The runner logs a genuinely unknown type once per turn (`Effect.logWarning` via `Stream.tap` + a dedup Set) and still drops it.
- **Tool-name conflict.** `mergeToolSets` (moved to `ai-sdk-tool-adapter.ts`, its natural home) now rejects a runtime-tool/host-command name collision with a typed `AiRuntimeError(tool_conflict)` instead of letting the host command silently shadow the tool. New `RUNTIME_ERROR_CODES.TOOL_CONFLICT` added to the contract (maps to `provider_failed` at the protocol boundary via the existing default).
- **OpenAI reasoning omission.** `openaiProviderOptions` mirrors Azure: an explicit/configured `none` effort drops `reasoningEffort` entirely (no more 400 for a non-reasoning model); any other effort keeps the MEDIUM default. Wire-body test asserts no `reasoning` field for a `none` selection; the existing default-MEDIUM tests still hold.
- **Budget refactor.** Moving `mergeToolSets` out kept `tool-loop-agent-runner.ts` under the 300-line budget.
- Verification: agent-runtime 53 tests (+10), core 80, full `npm run verify` clean, e2e 12/12.

## Verification

```sh
npm test --workspace @side-chat/agent-runtime
npm run verify
```
