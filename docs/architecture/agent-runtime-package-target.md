# Agent Runtime Package Target

Status: implementation guide and current package map

This document describes how `packages/agent-runtime` is being shaped as the
current implementation drift is corrected. It is based on the accepted
production system design, `docs/architecture/agent-runtime.md`, and the older
prototype branch `origin/codex/current-app-state-before-main-doc-only`, where
the backend exercised both backend-facing tools and UI-facing host command
tools.

## Responsibility

`packages/agent-runtime` is a reusable server-side assistant execution package.

It owns:

- AI SDK v6 Agent / ToolLoopAgent execution.
- Effect programs around model calls, tool calls, streaming, cancellation,
  retries, timeouts, and telemetry.
- Provider adapter protocol and provider registry mechanics.
- Effect-based tool protocol and tool registry mechanics.
- Assistant profile protocol and profile registry mechanics.
- Context-board rendering into model-facing messages and instructions.
- AI SDK stream-part mapping into normalized runtime events.
- Test fakes and fixtures for runtime behavior.

It does not own:

- Product-specific tool catalogs.
- Concrete tool ports for a consuming application.
- Product authorization or business policy.
- Conversation persistence.
- Host application state.
- HTTP routes or Hono objects.
- Browser protocol schemas.
- Widget rendering.
- DB clients, vendor clients, or deployment secrets.

The short rule:

```txt
agent-runtime owns how an assistant turn runs.
callers own what context, tools, profile, and model are available for that turn.
```

## Package Shape

Target folder structure:

```txt
packages/agent-runtime/
  package.json
  tsconfig.json
  src/
    index.ts

    runtime/
      agent-runtime.ts
      runtime-request.ts
      runtime-event.ts
      runtime-error.ts

    effect/
      stream-interop.ts

    ai-sdk/
      tool-loop-agent-runner.ts
      ai-sdk-tool-adapter.ts

    providers/
      model-provider.ts
      provider-registry.ts
      openai/
        openai-model-provider.ts
      fake/
        fake-model-provider.ts

    profiles/
      assistant-profile.ts
      profile-registry.ts

    context/
      context-board.ts
      prompt-renderer.ts

    tools/
      runtime-tool.ts
      tool-registry.ts
      tool-selection.ts

    telemetry/
      runtime-observer.ts

    testing/
      mock-runtime-tool.ts
      scripted-language-model.ts
```

Concrete product tools should live outside this package. In Side Chat, they
should live in the consuming app as ports and adapters, then be passed into
`agent-runtime` through the runtime tool protocol.

## Public Interface

The package should expose a small server-side interface.

```ts
export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<AgentRuntimeEvent>;
  streamEffect(request: AgentRuntimeRequest): RuntimeEventStream;
};

export const createAgentRuntime = (options: AgentRuntimeOptions) => AgentRuntime;
```

`streamEffect` is the first-class internal server representation. `stream` is a
plain async-iterable adapter for callers that do not want to run Effect directly.
Effect may be public for server packages, but it must never leak into
`chat-client`, widget, host app, or browser protocol APIs.

```ts
export type AgentRuntimeOptions = {
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
  readonly promptRenderer?: PromptRenderer;
  readonly observer?: RuntimeObserver;
};
```

Per turn:

```ts
export type AgentRuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly profileId?: string;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard?: RuntimeContextBoard;
  readonly availableToolNames?: readonly string[];
  readonly tools?: readonly RuntimeTool[];
  readonly abortSignal?: AbortSignal;
};
```

The runtime may be created with registered tools, receive turn-local tools, or
both. `availableToolNames` selects from the merged registry for the current turn.
The user request must not directly choose tools.

## Effect Model

Effect is used inside `agent-runtime` where it earns locality:

- Provider calls run as typed Effect programs.
- Tool execution runs as typed Effect programs.
- Runtime streams use Effect Stream internally.
- Tool/provider errors are typed values, not unstructured thrown strings.
- Cancellation uses Effect scopes and the request abort signal.
- Timeouts and retry schedules sit around provider/tool calls.
- Telemetry spans wrap runtime turn, provider step, tool execution, and stream
  mapping.

Do not wrap pure object formatting helpers in Effect unless they need typed
errors, dependencies, resources, concurrency, cancellation, or observability.

## Provider Protocol

Provider adapters must not orchestrate the assistant turn.

They should resolve model handles and provider options for the AI SDK runner:

```ts
export type ModelProvider = {
  readonly providerId: string;
  readonly modelIds: readonly string[];
  resolveModel(selection: ModelSelection): Effect.Effect<LanguageModel, ProviderError>;
  resolveProviderOptions?(
    selection: ModelSelection,
  ): Effect.Effect<ProviderOptions | undefined, ProviderError>;
};
```

The runtime owns the AI SDK ToolLoopAgent. Providers do not return
`AsyncIterable<RuntimeEvent>`.

Execution direction:

```txt
AgentRuntime.stream
  -> resolve profile
  -> resolve provider/model
  -> select available tools
  -> render context board into messages/instructions
  -> run AI SDK ToolLoopAgent
  -> map AI SDK stream parts into AgentRuntimeEvent
```

## Tool Protocol

`agent-runtime` owns the tool protocol, not every concrete tool. This protocol
must be Effect-based at the interface level so tool failures, dependencies,
timeouts, cancellation, and telemetry stay typed.

A runtime tool is a model-callable capability:

```ts
export type RuntimeTool = BackendRuntimeTool | UiRuntimeTool;

export type RuntimeToolBase = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema?: JsonSchema;
  readonly timeoutMs?: number;
};

export type BackendRuntimeTool = RuntimeToolBase & {
  readonly target: "backend";
  execute(
    input: JsonObject,
    context: RuntimeToolContext,
  ): Effect.Effect<RuntimeToolOutput, RuntimeToolError, RuntimeToolRequirements>;
};

export type UiRuntimeTool = RuntimeToolBase & {
  readonly target: "ui";
  execute(
    input: JsonObject,
    context: RuntimeToolContext,
  ): Effect.Effect<RuntimeUiActionOutput, RuntimeToolError, RuntimeToolRequirements>;
};
```

`RuntimeToolRequirements` is intentionally generic. The runtime does not know
whether a tool needs a finance service, PDF renderer, host-command validator,
CRM client, feature flag reader, or test fixture. The app supplies those
requirements through Effect layers when it constructs or runs the tool.

Backend-facing tools connect the model to server-side work:

- read approved business data;
- call an external service through a service adapter;
- generate a report;
- query a controlled data source;
- run deterministic local fixtures in tests.

UI-facing tools create validated UI actions:

- filter or sort a host table;
- focus a host resource;
- open a panel or route;
- request a host command that the widget/host may apply.

The older branch used this idea through a `host_command` model-facing tool. The
tool validated LLM-friendly input, translated it into `sidechat.v1` host command
shape, and the widget/host executed the command. That pattern should survive,
but as a generic UI-action tool protocol rather than product-specific code in
`agent-runtime`.

## Tool Ownership

Tool protocol ownership:

```txt
agent-runtime
  owns RuntimeTool, tool registry mechanics, AI SDK tool adaptation,
  tool stream mapping, typed tool errors, and telemetry.
```

Concrete app tool ownership:

```txt
consuming app
  owns tool ports such as FinanceLookupToolPort, PdfReportToolPort,
  HostCommandToolPort, CrmLookupToolPort, WorkbenchQueryToolPort,
  and any concrete tool definitions built from those ports.
```

Composition ownership:

```txt
partner-ai-service or another server composition root
  builds Effect layers for those app-owned tool ports, creates RuntimeTool
  adapters, and registers the selected tools with agent-runtime.
```

Adding a tool should usually touch the consuming app only. It should not require
editing `agent-runtime` unless the generic Effect tool protocol itself needs a
new capability.

Example:

```ts
const runtime = createAgentRuntime({
  providers: [openAiProvider],
  tools: [financeLookupTool, pdfReportTool, hostCommandTool],
});
```

Those tool values are app-owned adapters that satisfy the runtime interface:

```ts
const financeLookupTool: BackendRuntimeTool = {
  name: "finance_lookup",
  target: "backend",
  description: "Look up approved finance data.",
  inputSchema,
  execute: (input, context) =>
    Effect.gen(function* () {
      const finance = yield* FinanceLookupToolPort;
      return yield* finance.lookup(input, context);
    }),
};
```

Per-turn policy can still restrict tools:

```ts
runtime.stream({
  requestId,
  assistantTurnId,
  providerId: "openai",
  modelId: "gpt-5.4-mini",
  profileId: "advisory-assistant",
  messages,
  contextBoard,
  availableToolNames: ["finance_lookup", "host_command"],
});
```

## Backend Tools

Backend tools return data to the model loop and may also produce activity
metadata for downstream UI.

Backend tool rules:

- Tool input is parsed at the runtime boundary.
- Tool execution is Effect-based at the `RuntimeTool` interface.
- External clients are app-owned ports/layers, not imports hidden inside the
  runtime package.
- Tool output is assistant-safe and redacted before it becomes model-visible or
  activity-visible.
- Sources/citations are mapped by the concrete tool.
- Timeouts, retries, and typed failures are runtime concerns.

The runtime maps AI SDK tool parts to runtime events:

```txt
tool-input-start -> tool activity running
tool-call        -> tool activity running with input
tool-result      -> tool activity completed with output/sources
tool-error       -> tool activity failed with typed error
```

## UI Tools

UI tools are model-callable, but their effect is applied by the client or host
surface, not by the model provider.

UI tool rules:

- The tool validates and normalizes model input on the server.
- The output is a stable UI action command, not arbitrary script.
- The runtime emits a normalized runtime UI-action event.
- `partner-ai-core` maps that event into the product protocol.
- The widget dispatches the command through `host-bridge`.
- Host result persistence remains a product decision outside the generic
  runtime.

Target runtime event:

```ts
export type RuntimeUiActionEvent = RuntimeEventBase & {
  readonly type: "runtime.ui_action";
  readonly actionId: string;
  readonly actionName: string;
  readonly status: "requested";
  readonly payload: JsonObject;
};
```

For Side Chat, this can map to `sidechat.activity` with
`activityKind: "host_command"` or to a future dedicated host-command event if
the protocol chooses that shape. The runtime should not import widget or host
app code.

## Context Board

The context board is built outside `agent-runtime`.

`partner-ai-core` or another application core owns:

- authorized conversation history;
- host context trust and freshness;
- context budget decisions;
- context squashing policy;
- redaction;
- context snapshot and manifest persistence;
- allowed tool names for the turn;
- selected profile/model/provider according to product policy.

`agent-runtime` owns:

- the `RuntimeContextBoard` input shape it can render;
- prompt rendering from the board into AI SDK messages/instructions;
- profile instructions and runtime formatting rules;
- model-specific prompt quirks hidden behind the renderer.

This keeps product authority separate from model execution.

```txt
partner-ai-core builds trusted ContextBoard
  -> agent-runtime renders ContextBoard for the selected assistant profile
  -> ToolLoopAgent executes with selected tools
```

Context squashing that needs an LLM should be modeled as an explicit runtime
operation, but the decision to squash and what may be included remains an
application/core responsibility.

## Profiles

`agent-runtime` owns the profile protocol and registry mechanics. Concrete
profiles may be injected by the consuming project.

```ts
export type AssistantProfile = {
  readonly profileId: string;
  readonly displayName?: string;
  readonly systemInstructions: string;
  readonly defaultProviderId?: string;
  readonly defaultModelId?: string;
  readonly defaultToolNames?: readonly string[];
  readonly stopRules?: RuntimeStopRules;
};
```

The runtime combines:

- profile default tools;
- composition-registered tools;
- policy-provided `availableToolNames`;
- turn-local tools;
- provider/model selection.

The result is the exact AI SDK ToolLoopAgent configuration for one turn.

## Runtime Events

Normalized runtime events stay provider-neutral and AI SDK-neutral:

```txt
runtime.started
runtime.output_delta
runtime.reasoning
runtime.tool_activity
runtime.ui_action
runtime.completed
runtime.error
```

Side Chat may map these into `sidechat.activity`, `sidechat.delta`,
`sidechat.completed`, and `sidechat.error`. Other consuming projects may map
them differently.

Provider-native stream parts, AI SDK UI messages, Effect errors, DB rows, HTTP
objects, and widget objects must not cross this event seam.

## Public Exports

The root `index.ts` should export:

- `createAgentRuntime`;
- `AgentRuntime` and request/event types;
- `RuntimeTool` protocol types;
- `ModelProvider` protocol types;
- `AssistantProfile` protocol types;
- registry factories;
- testing fakes if accepted.

It should not export:

- AI SDK `ToolLoopAgent` factory;
- provider SDK objects;
- app-specific tools;
- widget/host types beyond generic JSON/UI-action payloads;
- Hono, DB, or service-composition types.

## Implementation Status

Implemented baseline:

- `createAgentRuntime` now owns assistant turn orchestration and runs the AI SDK
  `ToolLoopAgent`.
- Providers resolve model handles/options through `ModelProvider`; they do not
  stream runtime events themselves.
- The runtime exposes `streamEffect` as an Effect `Stream` and keeps
  `stream` as an async-iterable adapter.
- Assistant profiles are registered and render profile instructions.
- `RuntimeContextBoard` can be passed per turn and is rendered into
  model-facing context messages.
- Tool availability can be selected per turn with `availableToolNames`.
- `RuntimeTool` now executes through `Effect` at the interface level.
- AI SDK tool adaptation runs injected `RuntimeTool.execute` effects and passes
  runtime request context into the tool.
- Concrete `mock_web_search` moved out of `agent-runtime` public exports and
  into `apps/partner-ai-service` as an app-owned adapter.
- `agent-runtime` tests keep deterministic tool fixtures under `src/testing`
  rather than exporting product tools from the package.

Remaining drift:

- Backend/UI tool target support is not yet represented in the concrete
  interface.
- Context squashing is not implemented yet; the runtime only accepts a prepared
  context board.
- Effect layers for concrete app tool requirements are still owned by the app
  composition root and are not modeled as runtime requirements yet.
- Runtime telemetry observer hooks exist only as a minimal protocol.

Correction path:

1. Add backend and UI tool target support at the runtime interface.
2. Add context squashing as an explicit application/core-to-runtime workflow.
3. Model Effect tool requirements/layers without making `agent-runtime` know
   concrete app ports.
4. Expand runtime telemetry from protocol stubs to step/provider/tool spans.
5. Move development-only concrete tools to app ports, testing packages, or
   tool-fixture packages unless they are explicitly accepted as runtime fixtures.
6. Continue narrowing root exports as consumers migrate to stable protocol
   types.

## Invariants

- AI SDK stays inside `agent-runtime`.
- Effect is first-class inside server runtime execution, but not required by
  browser consumers.
- Tools are app-owned ports/adapters injected as Effect-based runtime
  capabilities, not product-specific code hardcoded into `agent-runtime`.
- Backend and UI tools use the same runtime tool protocol.
- UI tools emit validated action events; they do not mutate host state directly.
- Product policy chooses available tools per turn.
- The runtime never infers tool use from prompt keywords before the model acts.
- Provider adapters provide models/options; the runtime orchestrates the agent.
- Context selection and trust belong to application/core; prompt rendering
  belongs to runtime.
