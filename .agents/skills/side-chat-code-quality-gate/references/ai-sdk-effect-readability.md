# AI SDK and Effect Readability

Use this reference for `packages/agent-runtime`, `packages/partner-ai-core`, and service adapter code that touches Effect, Stream, AI SDK, ToolLoopAgent, provider selection, runtime tools, runtime events, or protocol mapping.

## Local mental model required

A reader should be able to reconstruct this path locally:

```txt
partner-ai-core prepares allowed turn
-> agent-runtime resolves profile/provider/model/tools
-> AI SDK ToolLoopAgent runs the provider/tool loop
-> agent-runtime maps AI SDK parts to RuntimeEvent
-> core/service map RuntimeEvent to sidechat.v1 events
-> widget renders protocol activity rows
```

If code or comments force the reader to infer this whole chain from vague terms, improve names, extract a boundary step, or add a short context bridge comment.

## Failure model

Expected failures belong in Effect's typed error channel:

```txt
Effect.fail
Effect.try
Effect.tryPromise
yield* failing effects
```

Raw `throw` is a defect. Boundary catchers may convert defects as a safety net, but expected provider, policy, persistence, or tool failures should not rely on raw JavaScript throws.

A good local comment says where conversion happens:

```ts
// Convert adapter defects at the runtime boundary so core receives the same
// AgentRuntimeError shape as ordinary typed runtime failures.
```

## AI SDK mapping rules

Provider-native stream parts stay inside `packages/agent-runtime`.

For tool activity, the local mapping is:

```txt
tool-input-start -> running tool activity with empty input
tool-call        -> same activity with completed input
tool-result      -> same activity completed with result/sources
tool-error       -> same activity failed with TOOL_FAILED
```

The stable identity is `toolCallId`. Preserve it as the activity id unless a protocol change explicitly says otherwise.

## Dense pipeline smell

Flag code when one expression combines several of these:

- runtime request preparation;
- provider/model resolution;
- tool selection;
- stream opening;
- Effect-to-Stream unwrapping;
- defect catching;
- provider-native part mapping;
- runtime-to-protocol mapping.

Prefer names that describe domain steps:

```ts
const runtimeExecution = createRuntimeExecution(state, request);
const providerStream = Effect.map(runtimeExecution, openAiSdkRuntimeStream);

return catchRuntimeDefects(Stream.unwrap(providerStream));
```

Avoid helper names like `handle`, `process`, `map`, or `run` when a boundary-specific name is available.

## Review questions

1. Which package owns this decision?
2. What is the source representation?
3. What is the target representation?
4. What stable id/order/failure rule is preserved?
5. What provider-native detail must stay private?
6. Is the Effect failure channel still visible?
7. Would a reader outside the current PR understand the local sequence?

If the answer is unclear, do not add a long tutorial comment. First improve names and structure. Then add the smallest useful context bridge.
