# 22 — Model call-settings seam

**Epic:** 4 Seams | **Priority:** P1 | **Depends on:** — | **Status:** todo

## Problem

Ordinary model parameters have no path: `temperature`, `maxOutputTokens`, `topP`, `stopSequences`, and the tool-loop step cap are not expressible anywhere — the runner constructs the agent with only `model / allowSystemInMessages / maxRetries: 0 / tools / toolChoice / providerOptions` (`packages/agent-runtime/src/runtime/ai-sdk/streaming/tool-loop-agent-runner.ts:148-157`). These are top-level AI-SDK call settings, not `providerOptions`, so an adopter's first customization ("cap output tokens") requires editing the private runner. The loop terminates only via ToolLoopAgent's invisible internal `stepCountIs(20)` default — not configurable, not documented, and a capped turn maps to a normal `completed(stop)` (silent truncation). Reasoning effort, by contrast, flows end-to-end via config — use it as the pattern.

## Decided approach

1. Add a provider-neutral `callSettings` bag to `AiRuntimeRequest` (`packages/ai-runtime-contract`): `{ temperature?, maxOutputTokens?, topP?, stopSequences?, maxToolSteps? }` — optional, documented, no provider types.
2. The runner spreads them into the agent construction; `maxToolSteps` becomes an explicit `stopWhen: stepCountIs(n)` with the default **written down** (keep 20; name it as a constant with a comment).
3. Surface in `sidechat.config.ts` per model or per turn-profile (follow how reasoning defaults flow: `models.default.reasoning` → profile → request; put callSettings beside reasoning in the model entry). Core threads profile → `buildModelTurnRequest` → request (`packages/partner-ai-core/.../build-model-turn-request.ts`).
4. When the step cap fires (`finishReason: tool-calls` from the SDK), map to `completed` with a distinct finish reason (`RUNTIME_FINISH_REASONS` — add `TOOL_STEP_LIMIT` or reuse LENGTH semantics; pick one and test) so truncation is observable, not silent. Coordinate with story 18's finish-reason mapping changes.
5. Wire-body tests (the house pattern: injected fetch asserting the Responses request body) proving temperature/maxOutputTokens/stop reach the wire; a scripted-model test proving the step cap stops the loop at n.

## Acceptance criteria

- [ ] Setting `maxOutputTokens` in `sidechat.config.ts` reaches the provider request body (wire test).
- [ ] The tool loop stops at the configured `maxToolSteps` and reports a distinct finish reason (test).
- [ ] Defaults unchanged when the bag is absent (no behavior change for existing configs).
- [ ] Contract README documents the bag; extension-seams.md gains a "change model parameters" row.

## Verification

```sh
npm test --workspace @side-chat/agent-runtime
npm test --workspace @side-chat/partner-ai-core
npm run verify
```
