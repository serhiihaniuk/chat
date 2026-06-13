# Readability refactor examples

These examples target the exact failure mode where code is technically correct but too hard to read because it assumes the reader already knows the AI SDK/Effect/domain context.

## Example 1: nested Effect/Stream expression

Problem shape:

```ts
/**
 * streamEffect is the Effect-native way to run one assistant turn.
 *
 * It prepares the provider-ready request first. If that succeeds, it opens
 * the AI SDK ToolLoopAgent as an Effect Stream so provider failures,
 * cancellation, timeouts, and future tracing stay in the typed workflow.
 */
const streamEffect = (request: AgentRuntimeRequest): RuntimeEventStream =>
  catchRuntimeDefects(
    Stream.unwrap(
      Effect.map(
        createRuntimeExecution(state, request),
        ({ model, providerOptions, providerRequest }) =>
          runAiSdkToolLoopAgentStream({
            model,
            providerOptions,
            request: providerRequest,
          }),
      ),
    ),
  );
```

What is wrong:

- the comment explains the intent, but the expression still makes the reader unpack nested Effect/Stream mechanics;
- the important domain step is anonymous: opening the AI SDK runtime stream;
- the phrase “Effect-native” assumes the reader already knows why this shape exists;
- the source and target boundary are only partly named.

Preferred shape:

```ts
/**
 * Run one Side Chat assistant turn through the private AI SDK adapter.
 *
 * `partner-ai-core` calls this after preparing the turn. Keeping the result as
 * an Effect Stream lets provider failures, cancellation, and runtime defects be
 * normalized before the HTTP/SSE boundary sees them.
 */
const streamEffect = (request: AgentRuntimeRequest): RuntimeEventStream => {
  const runtimeExecution = createRuntimeExecution(state, request);
  const providerStream = Effect.map(runtimeExecution, openAiSdkRuntimeStream);

  return catchRuntimeDefects(Stream.unwrap(providerStream));
};

const openAiSdkRuntimeStream = ({
  model,
  providerOptions,
  providerRequest,
}: RuntimeExecution): RuntimeEventStream =>
  runAiSdkToolLoopAgentStream({
    model,
    providerOptions,
    request: providerRequest,
  });
```

Why this is better:

- the business step has a name: `openAiSdkRuntimeStream`;
- the nested containers are still present, but the reader can follow them one at a time;
- the comment names who calls this and where the boundary ends;
- the comment does not explain every Effect combinator.

Do not mechanically apply this exact diff if the surrounding code would become worse. The rule is to name the domain step and reduce nested mental parsing.

## Example 2: comment with hidden domain assumptions

Problem shape:

```ts
/**
 * Convert a provider/tool execution failure into the runtime activity contract.
 *
 * The detailed thrown value stays private to the adapter boundary. Downstream
 * code only needs a stable failed activity with a typed protocol error code.
 */
const mapToolError = (
  request: RuntimeProviderRequest,
  sequence: number,
  part: AiSdkToolErrorPart,
): RuntimeEvent =>
  createToolActivity({
    request,
    sequence,
    status: ACTIVITY_STATUS_FAILED,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    errorCode: RUNTIME_ERROR_CODES.TOOL_FAILED,
    ...titleProp(part.title),
  });
```

What is wrong:

- it says “provider/tool execution failure” but does not name the concrete source entity;
- it says “runtime activity contract” but does not say the target is a Side Chat runtime tool activity row;
- “adapter boundary” is vague unless the reader already knows `agent-runtime` owns AI SDK details;
- the code itself is clear enough, but the comment misses the context bridge.

Preferred comment:

```ts
/**
 * Convert AI SDK `tool-error` stream parts into Side Chat's tool activity row.
 *
 * The thrown provider/tool value stays inside `agent-runtime`; downstream
 * packages only receive a failed activity and the stable `TOOL_FAILED` code.
 */
```

This is not much longer, but it tells the reader the source, target, owner, and downstream guarantee.

## Example 3: when to refactor instead of comment

Bad:

```ts
// Prepare the request and open the provider stream.
const stream = Stream.unwrap(Effect.map(createRuntimeExecution(state, request), (execution) => runAiSdkToolLoopAgentStream({ model: execution.model, providerOptions: execution.providerOptions, request: execution.providerRequest })));
```

Better:

```ts
const runtimeExecution = createRuntimeExecution(state, request);
const providerStream = Effect.map(runtimeExecution, openAiSdkRuntimeStream);
const stream = Stream.unwrap(providerStream);
```

A comment that merely labels a dense expression is weak. Named steps are stronger.
