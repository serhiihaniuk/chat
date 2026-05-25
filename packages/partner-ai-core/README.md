# Partner AI Core

`@side-chat/partner-ai-core` is the product workflow package for the backend
assistant.

It answers one question:

```txt
Given an authenticated chat request and app-owned ports,
how do we produce a valid sidechat.v1 event stream?
```

It is not the HTTP app, not the database implementation, not the model runtime,
and not a concrete tool catalog. Those are adapters around this package.

## Mental Model

The core flow is:

```txt
ChatStreamRequest
  -> verify workspace authority
  -> evaluate product policy
  -> ensure conversation
  -> persist the user message
  -> ask AgentRuntimePort for a runtime stream
  -> map RuntimeEvent values into sidechat.v1 events
  -> validate one terminal protocol event
```

The browser never sees AI SDK stream parts, provider DTOs, database rows, Hono
objects, or Effect runtime internals. It receives only `sidechat.v1` protocol
events from `@side-chat/chat-protocol`.

## Responsibilities

`application/stream-chat/` owns the stream-chat use case:

- request authorization and policy order
- conversation preparation before SSE starts
- runtime-event to protocol-event mapping
- terminal event validation
- stream lifecycle observability

`domain/` owns product authority rules such as tenant/workspace access.

`policies/` owns the policy port and policy denial mapping.

`ports/` owns the interfaces this core package needs from the outside world.
Those ports are Effect-shaped because they are core workflow dependencies.

`services/` owns small reusable core services such as observability redaction
and Effect Layer wiring.

## Public Surface

The package-level workflow entrypoint is `streamChatEffect(input)`.

Consumers provide concrete ports through `createPartnerAiCoreLayer(...)`. The
core package does not expose a parallel Promise or `AsyncIterable` facade. If an
edge transport needs another shape, that transport adapter converts the Effect
stream at its own boundary.

## Effect-First Rule

Core ports return `Effect` or `Stream`:

```ts
type ConversationRepositoryPort = {
  ensureConversation(...): Effect.Effect<ConversationRef, unknown>;
  appendUserMessage(...): Effect.Effect<void, unknown>;
};

type AgentRuntimePort = {
  streamEffect(...): Stream.Stream<RuntimeEvent, unknown>;
};
```

The Promise world is allowed at adapter edges. For example, the service
persistence adapter can call async database repositories, but it converts that
work into `Effect.tryPromise` before handing it to core.

That split is intentional:

- `partner-ai-core` describes the assistant workflow as typed effects.
- `partner-ai-service` adapts Hono, repositories, environment, and other edge
  systems into those effects.
- browser/client/widget APIs stay plain TypeScript and protocol-friendly.

## Why Effect Fits This Package

AI chat is long-running and asynchronous by nature. One request can authorize a
user, persist data, start a provider stream, receive deltas for minutes, map tool
activity, observe failures, and still need exactly one terminal protocol event.

Plain Promises make those concerns spread across `try/catch`, mutable state,
manual cancellation, and ad hoc error mapping. Effect gives us one workflow type
for:

- typed expected failures
- streaming values over time
- cancellation and interruption
- dependency services through Layers
- retries, timeouts, and schedules when a port needs them
- observability spans and structured lifecycle records

The important rule is scope. Effect is the server/core workflow discipline. It
must not leak into `sidechat.v1`, the widget public API, or the host app.

Known product failures should be modeled with typed Effect failures. Use
`Effect.fail`, `Effect.try`, `Effect.tryPromise`, or yielded failing effects for
expected auth, policy, persistence, runtime, and observability failures. Raw
JavaScript `throw` is a defect and should be treated as a bug, even when package
boundaries map defects into typed errors as a safety net.

## Stream Surfaces

`streamChatEffect(input)` is the package API. It reads app-owned ports from an
Effect Layer and returns `Stream<SidechatStreamEvent, PartnerAiCoreError>`.

The service route consumes `streamChatEffect` and only converts to
`AsyncIterable` at the SSE response boundary because the response writer needs
that transport shape.

## Context Board Ownership

Context-board construction belongs here, not in `agent-runtime`.

The core package should own product decisions such as which conversation or host
context may be included, what must be redacted, how context is squashed, how
context manifests are persisted, and which prepared context board is sent into a
runtime turn. App/service adapters implement the concrete IO ports needed for
those decisions.

`agent-runtime` receives only the prepared `RuntimeContextBoard` and renders it
into model-facing messages.

## Error Shape

Expected product failures use `PartnerAiCoreError`. The error contains:

- a backend `code`
- a protocol-safe `protocolCode`
- a `retryable` flag

Before `sidechat.started`, these errors can become request-level HTTP errors.
After `sidechat.started`, runtime failures become terminal `sidechat.error`
events so the stream contract stays valid.

## Adding A Port

Add a new core port when the use case needs a new outside capability. Keep the
port in `packages/partner-ai-core/src/ports` or the owning core area, return
`Effect` for async/failing work, and implement the concrete adapter in the app
or package that owns the external system.

Do not call external services directly from core use cases. Core should ask a
port; adapters should do the real IO.

## Verification

Package-local checks:

```sh
npm run typecheck --workspace @side-chat/partner-ai-core
npx vitest run packages/partner-ai-core/src/application/stream-chat/stream-chat.test.ts
```

Service integration checks that exercise the core use case through HTTP:

```sh
npx vitest run apps/partner-ai-service/src/inbound/http/app.test.ts
```
