# 18 — Runtime abort mapping + single-terminal enforcement

**Epic:** 3 Protocol | **Priority:** P1 | **Depends on:** — | **Status:** todo

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

- [ ] Abort mid-stream yields exactly one `runtime.completed(aborted)` (test).
- [ ] Error-then-finish yields exactly one terminal (`runtime.error`) — test the double-terminal repro.
- [ ] An unknown part type logs once and is dropped; every known type is either mapped or in the ignore-set (exhaustiveness helper/test).
- [ ] Host command named like a runtime tool → typed failure, not silent override (test).
- [ ] OpenAI non-reasoning model selection sends no reasoning option (wire-body test, like the existing Responses-body tests).

## Verification

```sh
npm test --workspace @side-chat/agent-runtime
npm run verify
```
