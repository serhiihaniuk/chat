# Agent Runtime

`@side-chat/agent-runtime` is the server-side assistant execution package.

It answers one question:

```txt
Given a turn request, injected tools, and injected model providers,
how do we run one assistant turn and emit normalized runtime events?
```

It is not the product core, not the HTTP service, not a tool catalog, and not a
context-engineering engine. Those pieces live in the consuming app/core and are
passed in as data or protocol implementations.

## Mental Model

The runtime flow is intentionally linear:

```txt
AgentRuntimeRequest
  -> resolve assistant profile
  -> resolve provider/model
  -> select injected tools for this turn
  -> render profile instructions and context board
  -> run AI SDK ToolLoopAgent
  -> map AI SDK stream parts into RuntimeEvent
```

The package keeps AI SDK and provider-native stream details private. Callers see
only `RuntimeEvent` values.

## Folder Shape

```txt
src/
  index.ts

  runtime/
    agent-runtime.ts
    runtime-request.ts
    runtime-event.ts
    runtime-error.ts
    runtime-stream.ts

    ai-sdk/
      tool-loop-agent-runner.ts
      ai-sdk-tool-adapter.ts

  providers/
    model-provider.ts
    openai/openai-model-provider.ts
    fake/fake-model-provider.ts

  tools/
    runtime-tool.ts
    tool-registry.ts

  testing/
    mock-runtime-tool.ts
    scripted-language-model.ts
```

## Responsibilities

`runtime/` owns the assistant turn lifecycle and public runtime contracts:

- `agent-runtime.ts` is the readable orchestration story.
- `runtime-request.ts` is the input contract, including prepared context board.
- `runtime-event.ts` is the provider-neutral output contract.
- `runtime-stream.ts` bridges Effect `Stream` and plain `AsyncIterable`.
- `runtime/ai-sdk/*` contains the private AI SDK ToolLoopAgent adapter.

`providers/` owns the model-provider protocol and accepted provider adapters.
Providers resolve AI SDK model handles and provider options. They do not run the
assistant turn and do not emit runtime events.

`tools/` owns the runtime tool protocol. Concrete tools are app-owned ports or
adapters that satisfy this protocol, then get injected into the runtime.

`testing/` owns deterministic package-local fixtures for runtime tests.

## Public Surface

The root package exports:

- `createAgentRuntime`
- `AgentRuntime`, `AgentRuntimeOptions`, and `AssistantProfile`
- `AgentRuntimeRequest`, `RuntimeContextBoard`, and runtime message types
- `RuntimeEvent`, `RuntimeEventStream`, and runtime errors
- `RuntimeTool` and `createToolRegistry`
- `ModelProvider` and provider adapters
- package-local testing fakes

The root package does not export `runtime/ai-sdk/*`. AI SDK is an implementation
detail of this runtime.

## Context Board

`RuntimeContextBoard` is already-built context. The runtime does not decide what
to include, redact, squash, authorize, or persist.

The consuming app/core owns:

- context collection
- context squashing
- redaction and authorization
- context manifests and persistence
- tool availability policy

The runtime only renders the board into model-facing system context for the
selected assistant turn.

## Tools

Tools are injected capabilities:

```ts
const runtime = createAgentRuntime({
  providers: [openAiProvider],
  tools: [financeLookupTool, pdfReportTool, hostCommandTool],
});
```

Adding a concrete tool should usually touch the consuming app only. The runtime
needs to change only when the generic `RuntimeTool` protocol itself changes.

`RuntimeTool.execute` returns an Effect so expected failures, cancellation,
dependencies, timeouts, and future telemetry remain typed at the interface.

## Effect

Effect is part of the server/runtime boundary:

- runtime streams are Effect `Stream<RuntimeEvent, AgentRuntimeError>`
- tools execute as typed Effects
- providers resolve models/options as typed Effects

The runtime also exposes `stream(request): AsyncIterable<RuntimeEvent>` for
callers that do not want to consume Effect directly.

Effect types must not leak into browser protocol, widget, or host APIs.

## Adding Things

Add a provider when there is a new accepted model backend:

- implement `ModelProvider`
- place concrete adapter code under `providers/<provider>/`
- keep provider SDK specifics inside the adapter

Add a tool when there is a new model-callable capability:

- define the concrete tool in the consuming app or service adapter layer
- implement the `RuntimeTool` protocol
- inject it through `createAgentRuntime({ tools })`

Add context behavior when the product needs better prompt context:

- build or squash context in the consuming app/core
- pass the prepared `RuntimeContextBoard` into the runtime request
- change runtime rendering only if the model-facing representation changes

Add AI SDK behavior only under `runtime/ai-sdk/`.

## Verification

Package-local checks:

```sh
npm run typecheck --workspace @side-chat/agent-runtime
npm test --workspace @side-chat/agent-runtime
```

Repository gate:

```sh
npm run verify
```
