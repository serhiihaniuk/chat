# 22 — Model call-settings seam

**Epic:** 4 Seams | **Priority:** P1 | **Depends on:** — | **Status:** done

## Problem

Ordinary model parameters have no path: `temperature`, `maxOutputTokens`, `topP`, `stopSequences`, and the tool-loop step cap are not expressible anywhere — the runner constructs the agent with only `model / allowSystemInMessages / maxRetries: 0 / tools / toolChoice / providerOptions` (`packages/agent-runtime/src/runtime/ai-sdk/streaming/tool-loop-agent-runner.ts:148-157`). These are top-level AI-SDK call settings, not `providerOptions`, so an adopter's first customization ("cap output tokens") requires editing the private runner. The loop terminates only via ToolLoopAgent's invisible internal `stepCountIs(20)` default — not configurable, not documented, and a capped turn maps to a normal `completed(stop)` (silent truncation). Reasoning effort, by contrast, flows end-to-end via config — use it as the pattern.

## Decided approach

1. Add a provider-neutral `callSettings` bag to `AiRuntimeRequest` (`packages/ai-runtime-contract`): `{ temperature?, maxOutputTokens?, topP?, stopSequences?, maxToolSteps? }` — optional, documented, no provider types.
2. The runner spreads them into the agent construction; `maxToolSteps` becomes an explicit `stopWhen: stepCountIs(n)` with the default **written down** (keep 20; name it as a constant with a comment).
3. Surface in `sidechat.config.ts` per model or per turn-profile (follow how reasoning defaults flow: `models.default.reasoning` → profile → request; put callSettings beside reasoning in the model entry). Core threads profile → `buildModelTurnRequest` → request (`packages/partner-ai-core/.../build-model-turn-request.ts`).
4. When the step cap fires (`finishReason: tool-calls` from the SDK), map to `completed` with a distinct finish reason (`RUNTIME_FINISH_REASONS` — add `TOOL_STEP_LIMIT` or reuse LENGTH semantics; pick one and test) so truncation is observable, not silent. Coordinate with story 18's finish-reason mapping changes.
5. Wire-body tests (the house pattern: injected fetch asserting the Responses request body) proving temperature/maxOutputTokens/stop reach the wire; a scripted-model test proving the step cap stops the loop at n.

## Acceptance criteria

- [x] Setting `maxOutputTokens` in `sidechat.config.ts` reaches the provider request body (wire test).
- [x] The tool loop stops at the configured `maxToolSteps` and reports a distinct finish reason (test).
- [x] Defaults unchanged when the bag is absent (no behavior change for existing configs).
- [x] Contract README documents the bag; extension-seams.md gains a "change model parameters" row.

## Verification

```sh
npm test --workspace @side-chat/agent-runtime
npm test --workspace @side-chat/partner-ai-core
npm run verify
```

## Delivery notes

**Seam shape.** Added a provider-neutral `RuntimeCallSettings`
(`{ temperature?, maxOutputTokens?, topP?, stopSequences?, maxToolSteps? }`, all
optional) on `AiRuntimeRequest.callSettings`
(`packages/ai-runtime-contract/src/index.ts`). It flows exactly like reasoning
effort but on the **turn-profile** path (not the model-default path — see below):
`config.chat.turnProfile.callSettings` → `SideChatCallSettings` (config type) →
`ServiceTurnProfileConfig` → `TurnProfile.callSettings` → `TurnPolicyDecision`
(validation) → `buildModelTurnRequest` → `AiRuntimeRequest` →
`RuntimeProviderRequest` → runner.

**Runner mapping lives in the tool adapter, not the runner.** To keep
`tool-loop-agent-runner.ts` under the 300-line prod budget, the neutral→SDK
mapping is a small exported helper `agentCallSettings(callSettings)` in
`ai-sdk/tools/ai-sdk-tool-adapter.ts`. It returns the four sampling/output fields
(absent → `undefined`, so `omitUndefinedProperties` drops them and SDK defaults
stay) plus an always-present `stopWhen: stepCountIs(maxToolSteps ?? 20)`. The
runner spreads `...agentCallSettings(request.callSettings)` into the agent
construction.

**Step cap is now named and observable.** `ToolLoopAgent`'s invisible internal
`stepCountIs(20)` default is replaced by an explicit `DEFAULT_MAX_TOOL_STEPS = 20`
constant (documented). When the loop hits the cap the SDK yields
`finishReason: "tool-calls"`; `stream-part-mapper.ts` maps that to a **new**
`RUNTIME_FINISH_REASONS.TOOL_STEP_LIMIT` (`"tool_step_limit"`), distinct from
`stop`, so a truncated turn is never a silent normal completion. At the browser
protocol boundary `runtime-event-mapper.ts` folds `tool_step_limit` → protocol
`length` (via `mapCompletedFinishReason`) since the DTO has no step-limit reason
and truncation-by-length is the closest existing public semantics. Chose "add
`TOOL_STEP_LIMIT`" over "reuse LENGTH" (the story allowed either) so the runtime
layer stays precise while the public protocol stays stable.

**Provider reality — OpenAI drops sampling knobs for reasoning models.** The wire
test threads `{ maxOutputTokens: 256, temperature: 0.2, topP: 0.9 }` but asserts
only `max_output_tokens: 256` on the Responses body: the AI SDK's OpenAI provider
**drops `temperature`/`top_p` (with warnings) for reasoning models** (the
fake-config default `gpt-5.4-mini` is one). `maxOutputTokens` is the portable knob
that reaches the wire regardless. This is a provider concern, not a seam bug — the
neutral bag still carries all fields; each adapter decides what its model accepts.

**Tests (all in `npm run verify`, 612 passed | 4 skipped):**

- `openai-model-provider.test.ts` — "sends a configured maxOutputTokens in the
  Responses request body" (`max_output_tokens: 256`) + "omits maxOutputTokens …
  when no call settings" (absent → undefined on the wire).
- `runtime-terminal-semantics.test.ts` — `createLoopingToolProvider` (a model that
  never stops calling a tool) + "stops the tool loop at maxToolSteps and reports
  the step-limit finish reason" (`callSettings: { maxToolSteps: 2 }` → single
  `runtime.completed` terminal with `finishReason: "tool_step_limit"`, tool ran on
  the capped steps).
- `build-model-turn-request.test.ts` — "carries the profile's call settings" +
  "leaves call settings absent" (profile → request seam).
- `tool-config-registration.test.ts` — "surfaces configured call settings on the
  turn profile" + "leaves call settings absent when the config sets none"
  (config → profile seam).

**Docs.** `ai-runtime-contract/README.md` gains a "## Model call settings"
section + field table (incl. the "provider may drop a setting" note);
`docs/architecture/extension-seams.md` gains a "Change model parameters" seam-map
row + how-to.

**Design note — why the turn-profile path, not the model-default path.** The story
suggested "per model or per turn-profile … put callSettings beside reasoning in the
model entry." Reasoning effort actually flows through the **profile/policy** path
already (`TurnPolicyDecision.reasoning`), and that is where a per-turn generation
setting belongs (it is a property of *this* turn's policy, resolvable per
subject/profile later), so `callSettings` sits beside `reasoning` on
`TurnProfile`/`TurnPolicyDecision`, surfaced via `config.chat.turnProfile`. No
model-default entry was added; an adopter tunes generation on the turn profile.
