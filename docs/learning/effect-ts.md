# Effect TS From Scratch

Status: learning guide

This guide explains how Effect should be used in this repo. It assumes you are seeing Effect for the first time.

## The Problem Effect Solves

Normal TypeScript async code often hides three things:

```ts
async function run(): Promise<Result>
```

From that type alone, you do not know:

- what errors are expected
- what dependencies are required
- what resources need cleanup
- what happens when the request is interrupted

Effect makes those things visible.

```ts
Effect<Success, Error, Requirements>
```

Read that as:

```txt
This workflow can succeed with Success,
fail with Error,
and requires Requirements to run.
```

## Mapping That To This Repo

The chat use case is a workflow:

```txt
parse request
check model
authorize
rate-limit
check billing
load conversation context
append user message
stream model output
emit sidechat events
record usage
append assistant message
```

That workflow has expected errors:

- model unavailable
- unauthorized
- rate limited
- billing denied
- usage capture failed
- context unavailable
- invalid tool input

It also has requirements:

- `ModelPort`
- `ConversationRepository`
- `UsagePort`
- `AuthPort`
- `RateLimitPort`
- `BillingPort`
- `ObservabilityPort`
- `ConfigPort`
- Workbench tool/report ports when enabled

Those are exactly the things Effect is good at making explicit.

## Current Effect Usage

Effect is now used at meaningful workflow and contract boundaries:

```txt
packages/shared-protocol
  owns sidechat.v1 Effect schemas

apps/side-chat-api
  uses shared validation to decode unknown request bodies into application input

packages/side-chat-widget
  uses a small Effect workflow to decode stream-frame payloads before React state sees them
```

The first backend example:

```ts
export const streamChatEffect = (deps, input) =>
  Effect.map(decodeSidechatRequestEffect(input.body), (request) =>
    streamChatWithRequest(deps, input, request),
  );
```

That decode uses Effect Schema and maps malformed input to an application error:

```ts
export const decodeSidechatRequestEffect = (body) => {
  const parsed = validateRequest(body);
  return parsed.ok
    ? Effect.succeed(parsed.data)
    : Effect.fail(new InvalidRequest());
};
```

This is the first useful Effect lesson: unknown JSON enters the application as an Effect, and invalid JSON shape is an expected typed failure instead of a surprise thrown parser error.

The frontend example:

```txt
SSE data string
  -> Effect.sync(parse JSON)
  -> validateStreamEvent from shared protocol
  -> SidechatStreamEvent | undefined
```

That teaches the ownership rule:

```txt
Effect owns the workflow.
Effect Schema owns the protocol.
React owns rendering.
Zod can still exist inside adapters when a library expects it.
```

It still does not teach every Effect concept:

- required services
- layers
- resource lifetime
- interruption

That is not a failure. It is a deliberately narrow learning step.

## Target Effect Usage

The target is not "make every function an Effect." The target is:

```txt
Use Effect where workflow, errors, dependencies, or resources matter.
```

Good Effect candidates:

- `streamChat` workflow
- auth/rate/billing checks
- model gateway call
- DB-backed repositories
- report generation
- stream cancellation cleanup
- telemetry around request lifecycle

Bad Effect candidates:

- formatting money
- sorting rows
- filtering arrays
- building small labels
- protocol constants
- pure DTO shape helpers

## Services And Layers

A service is a dependency the workflow needs.

In this repo, `ModelPort` is already service-shaped:

```ts
export interface ModelPort {
  stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk>;
}
```

In Effect terms, the workflow should be able to say:

```txt
I require a model service.
I do not care whether it is OpenAI, fake model, or a future private model.
```

A layer is how you provide the real implementation:

```txt
Test layer
  -> fake model
  -> memory conversation repo
  -> memory usage repo

Local/dev layer
  -> fake or OpenAI model
  -> memory or DB repo

Production-like layer
  -> OpenAI/private provider adapter
  -> DB repo
  -> telemetry
```

The important idea: service interfaces stay clean, while construction details live in layers/composition.

## Typed Expected Errors

Effect separates expected errors from defects.

Expected errors are part of the domain workflow:

```txt
Unauthorized
RateLimited
ModelUnavailable
BillingDenied
```

Defects are programmer bugs or impossible states:

```txt
undefined function
bad import
broken invariant
unexpected null from a trusted dependency
```

The target architecture should convert expected errors into typed stream or HTTP errors at the inbound boundary. It should not pretend programmer bugs are normal user-facing states.

## Resource Lifetime And Cancellation

Streaming chat has lifetimes:

- browser starts a request
- backend starts model streaming
- tools may run
- DB writes happen
- browser may disconnect

Effect resource/finalizer patterns are useful because they let the workflow define cleanup for success, failure, and interruption.

In this repo, cancellation begins with `AbortSignal` from Hono:

```txt
c.req.raw.signal
  -> streamChat input
  -> ModelPort.stream
  -> AI SDK abortSignal
```

The target is to make this lifecycle explicit and testable.

## First Refactor To Learn Effect

The first Effect refactor should be narrow:

1. Keep pure helper functions pure.
2. Define typed application errors.
3. Decode the request with Effect Schema at the workflow boundary.
4. Provide ports through services/layers.
5. Run the program from the Hono adapter.
6. Translate typed errors into `sidechat.error` or pre-stream HTTP errors.

Do not start with a broad rewrite. You will learn more from one clean workflow than from a giant conversion.

## References

- Effect documentation, The Effect Type: https://effect.website/docs/getting-started/the-effect-type/
- Effect documentation, Expected Errors: https://effect.website/docs/error-management/expected-errors/
- Effect documentation, Managing Services: https://effect.website/docs/requirements-management/services/
- Effect documentation, Managing Layers: https://effect.website/docs/requirements-management/layers/
- Effect documentation, Resource Management: https://effect.website/docs/resource-management/introduction/
