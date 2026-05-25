# Agent Runtime

Status: accepted runtime design

`packages/agent-runtime` is the backend assistant execution engine. It is the
only package that may import AI SDK runtime/provider APIs.

The runtime boundary is `ToolLoopAgent`-first:

```txt
partner-ai-core
  -> AgentRuntimePort
  -> agent-runtime
    -> assistant profile defaults
    -> injected runtime tools
    -> injected model providers
    -> runtime/ai-sdk ToolLoopAgent adapter
    -> normalized runtime events
```

Provider adapters are model resolvers, not assistant-turn orchestrators. They
expose `ModelProvider.resolveModel` and optional provider options. The runtime
creates and runs the AI SDK `ToolLoopAgent` for every turn.

The runtime exposes two server-side stream surfaces:

- `streamEffect(request)`: first-class Effect
  `Stream<RuntimeEvent, AgentRuntimeError>`.
- `stream(request)`: async-iterable adapter for server callers that do not want
  to consume Effect directly.

## Package Shape

The folder map intentionally stays small:

```txt
src/
  runtime/
    agent-runtime.ts
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
  providers/
    model-provider.ts
    openai/
    fake/
  tools/
    runtime-tool.ts
    tool-registry.ts
  testing/
```

`runtime/agent-runtime.ts` is the entry point. `runtime/contract/*` is the public
request/event/error shape. `runtime/turn/*` decides profile, provider/model,
allowed tools, and final prompt messages before the model starts.
`runtime/ai-sdk/*` is private adapter code, not a public package domain.

## Tool Capabilities

Tools are registered capabilities available to the agent. Concrete tool
definitions are supplied by the consuming server app as ports/adapters that
satisfy the runtime protocol. They are not request-level instructions and they
are not backend keyword heuristics.

The model decides whether and when to call a tool after the runtime exposes the
available tool set to `ToolLoopAgent`.

Tool availability is decided by runtime/profile/policy composition before the
turn starts. Registered does not mean globally available: production profiles
must expose only accepted production tools, while development-only tools stay
behind explicit non-production configuration.

`agent-runtime` owns the protocol, registry mechanics, AI SDK tool adaptation,
and stream mapping. The consuming app owns concrete tool ports such as finance
lookup, PDF report generation, host command creation, or development fixtures.

Runtime tools use this product contract:

```ts
type RuntimeTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  execute(
    input: JsonObject,
    context: RuntimeToolContext,
  ): Effect.Effect<JsonObject, AgentRuntimeError, never>;
  readSources?: (result: JsonObject) => readonly ActivitySource[];
};
```

Tool execution is Effect-based at the interface level so expected failures,
cancellation, timeouts, dependencies, and telemetry can be handled as runtime
workflow concerns instead of untyped promise callbacks.

Rejected runtime-tool fields:

- `shouldInvoke`
- `createInput`
- pre-model `progress`

Those fields make the backend decide before the model starts. They create fake
instant activity and break the ChatGPT-style agent timeline.

## Context Board

`RuntimeContextBoard` is prepared context. It is passed in with the turn request
and rendered by the runtime, but it is not built by the runtime.

The app/core owns context gathering, redaction, authorization, squashing,
budgeting, and persistence. The runtime owns only the model-facing rendering of
that prepared board.

## Execution Flow

```txt
service composition registers app-owned runtime tools
  -> runtime resolves assistant profile and provider/model
  -> runtime renders profile instructions and prepared context board
  -> runtime converts selected tools into AI SDK tools
  -> ToolLoopAgent streams with toolChoice: "auto"
  -> model emits tool input/call parts when it chooses a capability
  -> AI SDK executes the selected tool adapter
  -> tool output returns to the model through the AI SDK tool loop
  -> runtime maps observed stream parts into normalized runtime events
```

The runtime must not append manual "Backend tool returned" system messages.
Tool results belong to the AI SDK tool loop and to product-safe activity
details.

## Stream Mapping

Provider-native stream parts are private to this package. Normalized runtime
events are the package boundary:

| AI SDK part        | Runtime event                                        |
| ------------------ | ---------------------------------------------------- |
| `reasoning-delta`  | `runtime.activity` with `activityKind: "reasoning"`. |
| `text-delta`       | `runtime.output_delta`.                              |
| `tool-input-start` | `runtime.activity` tool row running.                 |
| `tool-call`        | Same tool row with stable input.                     |
| `tool-result`      | Same tool row completed with result and sources.     |
| `tool-error`       | Same tool row failed with tool error code.           |
| `finish`           | `runtime.completed`.                                 |
| `error`            | `runtime.error`.                                     |

Tool activity uses `toolCallId` as the stable activity id. The started and
completed events update the same canonical row downstream.

Reasoning activity is a safe summary only. Raw hidden chain-of-thought never
crosses the runtime boundary.

## Development Tool

`mock_web_search` is the accepted development search capability. It lives in the
`apps/partner-ai-service` adapter layer and is injected into `agent-runtime`
only by non-production service composition. It simulates web search without
external egress, exposes a model-facing query schema, and returns deterministic
JSON plus source metadata.

It is still a normal registered runtime tool. The model must call it through the
agent loop. The backend must not auto-run it because a user typed "search" or
"web". Production service configuration must not expose this development
capability.

## Tests

Runtime tests must prove:

- tools are registered as available capabilities;
- the runtime does not execute a tool before provider/model streaming;
- missing provider/model/tool selections fail through the runtime boundary;
- AI SDK tool parts map into one stable runtime activity row;
- sources are mapped by the tool adapter;
- provider-specific stream shapes never leak into partner AI core, protocol,
  client, or widget code.
