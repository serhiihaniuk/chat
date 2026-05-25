# Agent Runtime

`@side-chat/agent-runtime` is the server-side assistant execution package.

It answers one question:

```txt
Given a turn request, injected tools, and injected model providers,
how do we run one assistant turn and emit normalized runtime events?
```

It is not the product core, not the HTTP service, not a tool catalog, and not a
context-engineering engine. Product workflow and context policy live in
`partner-ai-core`; concrete tools and adapters live in the consuming app. The
runtime receives prepared data and injected protocols.

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
      runtime-tool-executor.ts
      tool-activity-mapper.ts
      reasoning-activity.ts
      stream-part-mapper.ts
      json-value.ts

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

`runtime/` owns the assistant turn lifecycle:

- `agent-runtime.ts` is the readable orchestration story.
- `runtime/contract/*` is the public request/event/error/stream contract.
- `runtime/turn/*` decides profile, provider/model, allowed tools, and final
  prompt messages before the model starts.
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

`AgentRuntime` exposes `streamEffect(request)` only. Do not add a package-level
`stream(request)` or Promise wrapper; transports convert the Effect stream at
their own edge when necessary.

## Context Board

`RuntimeContextBoard` is already-built context. The runtime does not decide what
to include, redact, squash, authorize, or persist.

`partner-ai-core` and app-owned ports own:

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
`runtime/ai-sdk/runtime-tool-executor.ts` is the single Promise bridge required
by AI SDK tool callbacks; the tool protocol itself stays Effect-first.

## Effect

Effect is the TypeScript runtime library we use for typed async work.

If you have used `Promise`, `try/catch`, `AbortSignal`, dependency injection,
and async streams separately, Effect is the thing that lets us describe those
concerns in one consistent type. It makes async code say what can succeed, what
can fail, what services it needs, and how cancellation/streaming should behave.

In this package, that matters because an assistant turn is not a simple function
call. AI work is async by nature: a turn can stream for seconds or minutes,
wait for provider output, call tools, wait for those tools to call other
services, and still need to be cancellable and observable the whole time.

One turn can:

- resolve a provider/model
- stream provider output
- let the model call app-owned tools
- wait on long-running tool work such as reports, external APIs, or database
  queries
- cancel work when the user stops the turn
- return typed runtime errors instead of throwing random values
- keep all emitted events in a predictable stream

Effect solves the "everything is async and can fail differently" problem. It
lets us keep failures and streaming behavior explicit without inventing a custom
runtime abstraction on top of Promises.

### What Effect Does Here

`AgentRuntime.streamEffect(request)` is the native runtime API. It returns an
Effect `Stream<RuntimeEvent, AgentRuntimeError>`, which means:

- the stream emits only normalized `RuntimeEvent` values
- expected failures are represented as `AgentRuntimeError`
- cancellation can travel through the stream and into tool execution
- tests can consume the stream deterministically

Effect separates expected failures from defects. Expected failures are values in
the error channel, created with `Effect.fail`, `Effect.try`,
`Effect.tryPromise`, or by yielding another failing Effect. A raw `throw` is a
defect, which means "this code crashed" rather than "the runtime produced a
known failure." The runtime stream catches defects at the package boundary and
maps them to `AgentRuntimeError`, but implementation code should still model
known failure paths with Effect instead of `throw`.

The AI SDK runner also runs as an Effect stream internally. `agent.stream(...)`
is awaited only to open the provider/tool-loop stream handle; it does not wait
for the full assistant answer. The actual response keeps streaming through
`result.fullStream`, which Effect consumes part by part and maps into
`RuntimeEvent` values.

`RuntimeTool.execute(input, context)` returns an Effect because tools are real
backend ports. A tool might call a database, call a finance service, generate a
PDF, read tenant configuration, or be cancelled halfway through. Returning an
Effect lets the tool describe that work as a typed program instead of hiding
failures and dependencies inside an unstructured Promise.

Providers also use Effect when resolving model handles and provider options.
That keeps provider setup failures in the same typed error path as the rest of
the runtime turn.

### Why It Is Useful For This Runtime

Effect is useful here because `agent-runtime` is a boundary package. It sits
between product/core code, app-owned tools, provider adapters, and AI SDK. Those
pieces fail in different ways, but callers should receive one runtime contract.

The practical benefit is:

- tool failures stay typed and can become stable runtime events
- provider failures stay typed and can become stable runtime errors
- cancellation can be passed through the whole turn instead of being handled in
  every adapter by hand
- streams remain composable without losing error information
- long-running turns can stay represented as one typed stream instead of a pile
  of disconnected callbacks and Promise chains
- app-owned tools can depend on services later without changing the runtime API

The browser protocol, widget, host APIs, and `sidechat.v1` events should not
know that Effect exists. Effect is an internal server/runtime implementation
choice that helps this package keep async orchestration explicit and safe.

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

- build or squash context in `partner-ai-core` through app-owned ports
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
