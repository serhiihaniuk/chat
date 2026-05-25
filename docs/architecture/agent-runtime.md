# Agent Runtime

Status: accepted final-state runtime design

`packages/agent-runtime` is the backend assistant orchestration engine. It is
the only package that may import AI SDK runtime/provider APIs.

The runtime boundary is Agent/ToolLoopAgent-first:

```txt
partner-ai-core
  -> AgentRuntimePort
  -> agent-runtime
    -> assistant profile
    -> registered tool capabilities
    -> provider registry
    -> AI SDK ToolLoopAgent
    -> normalized runtime events
```

## Tool Capabilities

Tools are registered capabilities available to the agent. They are not
request-level instructions and they are not backend keyword heuristics.

The model decides whether and when to call a tool after the runtime exposes the
available tool set to `ToolLoopAgent`.

Tool availability is decided by runtime/profile/policy composition before the
turn starts. Registered does not mean globally available: production profiles
must expose only accepted production tools, while development-only tools stay
behind explicit non-production configuration.

Runtime tools use this product contract:

```ts
type RuntimeTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  run(input: JsonObject): Promise<JsonObject> | JsonObject;
  readSources?: (result: JsonObject) => readonly ActivitySource[];
};
```

Rejected runtime-tool fields:

- `shouldInvoke`
- `createInput`
- pre-model `progress`

Those fields make the backend decide before the model starts. They create fake
instant activity and break the ChatGPT-style agent timeline.

## Execution Flow

```txt
service composition registers runtime tools
  -> runtime resolves assistant profile and provider/model
  -> runtime converts registered tools into AI SDK tools
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

`mock_web_search` is the accepted development search capability. It simulates web
search without external egress, exposes a model-facing query schema, and returns
deterministic JSON plus source metadata.

It is still a normal registered runtime tool. The model must call it through the
agent loop. The backend must not auto-run it because a user typed "search" or
"web". Production service configuration must not expose this development
capability.

## Tests

Runtime tests must prove:

- tools are registered as available capabilities;
- the runtime does not execute a tool before provider/model streaming;
- AI SDK tool parts map into one stable runtime activity row;
- sources are mapped by the tool adapter;
- provider-specific stream shapes never leak into partner AI core, protocol,
  client, or widget code.
