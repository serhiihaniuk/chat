# Agent Runtime Package Shape

Status: current implementation guide

`packages/agent-runtime` is the reusable server-side assistant execution
package. It owns how one assistant turn runs. Callers own which context, tools,
profile, provider, and model are allowed for that turn.

## Responsibility

The package owns:

- AI SDK v6 `ToolLoopAgent` execution.
- Effect-based runtime streams.
- Effect-based runtime tool protocol.
- Provider adapter protocol and accepted provider adapters.
- Profile/default instruction handling.
- Context-board rendering into model-facing messages.
- AI SDK stream-part mapping into normalized runtime events.
- Deterministic runtime testing fixtures.

The package does not own:

- product-specific tool catalogs;
- concrete tool ports for a consuming app;
- context collection, authorization, redaction, squashing, or persistence;
- product policy;
- conversation persistence;
- HTTP routes or Hono objects;
- browser protocol schemas;
- widget or host application state;
- DB clients, vendor clients, or deployment secrets.

The short rule:

```txt
agent-runtime owns how an assistant turn runs.
callers own what the turn is allowed to know and do.
```

## Folder Shape

```txt
packages/agent-runtime/
  README.md
  package.json
  tsconfig.json
  src/
    index.ts

    runtime/
      agent-runtime.ts
      agent-runtime.test.ts

      contract/
        runtime-request.ts
        runtime-event.ts
        runtime-error.ts
        runtime-stream.ts

      turn/
        assistant-profile.ts
        prepare-runtime-turn.ts
        provider-selection.ts
        tool-selection.ts
        prompt-rendering.ts

      ai-sdk/
        tool-loop-agent-runner.ts
        ai-sdk-tool-adapter.ts
        ai-sdk-tool-adapter.test.ts

    providers/
      model-provider.ts
      openai/
        openai-model-provider.ts
        openai-model-provider.test.ts
      fake/
        fake-model-provider.ts
        fake-model-provider.test.ts

    tools/
      runtime-tool.ts
      tool-registry.ts
      tool-registry.test.ts

    testing/
      mock-runtime-tool.ts
      scripted-language-model.ts

    provider.type.test.ts
```

Removed top-level folders are intentional:

- `context/` was only a prepared context-board type plus prompt rendering.
  The type now lives in `runtime/contract/runtime-request.ts`, and rendering is
  private runtime turn preparation.
- `profiles/` was only small runtime config. `AssistantProfile` now lives in
  `runtime/turn/assistant-profile.ts`.
- `effect/` was not a product concept. Stream interop now lives in
  `runtime/contract/runtime-stream.ts`.
- `telemetry/` had only unused stubs. Add telemetry back when it has real
  observer wiring.
- `ai-sdk/` is nested under `runtime/` because AI SDK is the runtime engine, not
  a peer domain.

## Public Interface

```ts
export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<RuntimeEvent>;
  streamEffect(request: AgentRuntimeRequest): RuntimeEventStream;
};

export type AgentRuntimeOptions = {
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
};

export const createAgentRuntime: (options: AgentRuntimeOptions) => AgentRuntime;
```

The root package exports protocol types and accepted adapters. It does not
export AI SDK adapter internals.

## Runtime Flow

```txt
AgentRuntimeRequest
  -> runtime/turn prepares profile, provider/model, tools, and messages
  -> run runtime/ai-sdk ToolLoopAgent adapter
  -> map provider-native stream parts into RuntimeEvent
```

Provider adapters resolve model handles/options. They do not orchestrate the
assistant turn and do not return runtime event streams.

## Tools

`agent-runtime` owns the generic `RuntimeTool` protocol and the AI SDK tool
adapter. Concrete tools live in the consuming app as ports/adapters.

Adding a tool should usually touch only the app:

```ts
const runtime = createAgentRuntime({
  providers: [openAiProvider],
  tools: [financeLookupTool, pdfReportTool, hostCommandTool],
});
```

The runtime may be created with registered tools, receive turn-local tools, or
both. `availableToolNames` selects from the merged set for the current turn.
The runtime must not execute tools before the model chooses them through the
tool loop.

## Context Board

The context board is built outside `agent-runtime`.

The app/core owns:

- authorized conversation history;
- host context trust and freshness;
- context budget decisions;
- context squashing policy;
- redaction;
- context snapshot and manifest persistence;
- allowed tool names for the turn;
- profile/model/provider selection according to product policy.

`agent-runtime` owns:

- the `RuntimeContextBoard` input shape it can render;
- prompt rendering from the board into model-facing messages;
- profile instructions and runtime formatting rules.

Context squashing that needs an LLM should be modeled as an explicit app/core
workflow that may call a runtime operation. The authority over what may be
included remains outside this package.

## Effect

Effect is used where it makes the boundary clearer:

- `streamEffect` returns an Effect `Stream<RuntimeEvent, AgentRuntimeError>`;
- runtime tools execute through Effect;
- providers resolve models/options through Effect;
- typed provider/tool/runtime errors stay explicit.

Do not wrap pure object formatting helpers in Effect unless they need typed
errors, dependencies, resources, concurrency, cancellation, or observability.

## Invariants

- AI SDK stays inside `runtime/ai-sdk`.
- Provider-native stream parts never cross the runtime boundary.
- Concrete tools are app-owned injected capabilities.
- Backend and UI-facing tools use the same runtime tool protocol.
- Product policy chooses available tools per turn.
- Context selection and trust belong to application/core.
- Prompt rendering belongs to runtime.
- The runtime never infers tool use from prompt keywords before the model acts.
