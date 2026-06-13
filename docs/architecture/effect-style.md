# Effect Style

Read this when: you edit Effect, Stream, runtime, provider, or core workflow
code.
Source of truth for: Side Chat's local Effect readability style.
Not source of truth for: a general Effect tutorial.

## Local Rule

Effect is allowed because server/core/runtime work is asynchronous, cancellable,
typed, and streamed. That does not make inside-out expressions acceptable.

Prefer staged workflows:

```ts
const workflow = Effect.gen(function* () {
  const authorized = yield* authorizeRequest(input);
  const turnPlan = yield* resolveTurnPlan(authorized);
  const runtimeRequest = createRuntimeRequest(turnPlan);

  return openRuntimeStream(runtimeRequest);
});
```

Avoid hiding lifecycle order inside nested `Effect.map`, `Effect.flatMap`,
`Stream.unwrap`, callback, or object-spread chains.

## Expected Failures

- Use `Effect.fail`, `Effect.try`, `Effect.tryPromise`, or yielded failing
  effects for expected failures.
- A raw `throw` is a defect, not product control flow.
- Package boundaries may map defects to safe errors, but implementation code
  should not rely on that safety net.

## Stream Boundaries

- Runtime opens provider/AI SDK streams inside `agent-runtime`.
- Product core maps RuntimeEvents to SidechatStreamEvents.
- Service converts protocol streams to SSE/AsyncIterable at the HTTP edge.
- Browser packages never expose Effect streams.

## Step Comments

Use step comments only when a function coordinates multiple lifecycle concerns.
A useful step comment says what the step proves, records, hides, prepares, or
finalizes. It should not repeat the helper name.

## Related Docs

- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/boundaries.md`
- `docs/domain/vocabulary.md`
