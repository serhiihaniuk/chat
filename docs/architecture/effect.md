# Effect In Side Chat

Read this when: you hit `Effect`, `Stream`, `Fiber`, or `yield*` in this codebase and want the mental model and how much of it you actually need.
Source of truth for: the Effect mental model as used here, where Effect is allowed to live, what each contributor role must know, the house style, and the traps.
Not source of truth for: why Effect was chosen ([ADR 0003](../adr/0003-effect-as-core-effect-system.md)), import rules ([package-boundaries.md](package-boundaries.md)), or the turn lifecycle ([assistant-turn.md](assistant-turn.md)).

Effect is a TypeScript library for running work with typed errors, structured
cancellation, and guaranteed cleanup — think "promises with a supervisor". Side
Chat uses **v4** (pinned beta; stable expected before release — ADR 0003).
Effect lives only in the server engine room, gate-enforced, so how much you
need depends on what you are changing. Start with the mental model; then jump
to your role.

## The mental model in five ideas

**1. An Effect is a description, not a running thing.** `Effect.tryPromise(() =>
fetch(url))` does nothing until something runs it. That laziness is why
dependency injection here needs no framework: a port method returns a
description, composition decides which adapter built it, and tests hand in fake
descriptions — no mocking library, no import patching. See the fake ports in
`packages/partner-ai-core/src/testing/` driving the whole workflow.

**2. Reading a signature tells you everything.** `Effect.Effect<A, E>` reads:
"when run, succeeds with `A` or fails with `E`". So
`Effect.Effect<void, PartnerAiCoreError>` on a port means: no useful return
value, and the only expected failure is a typed core error you must handle.
If a function can fail and its `E` is `never`, that is a claim — a rejection
there becomes a _defect_ (an escaped bug), not a handled failure.

**3. A fiber is a supervised thread of work.** Forking an Effect returns a
fiber: a handle you can await, interrupt, or track. That is how a turn outlives
its HTTP request — `POST /chat/runs` forks generation into a `FiberMap` keyed
by `assistantTurnId` (`turn-runner.ts`), and cancel later finds exactly that
fiber. The discipline: a fiber nobody observes fails silently, so every fork
needs a supervisor, a join, or an exit log. The turn runner observes detached
generation fibers and reports non-interrupt exits.

**4. Interruption is real cancellation.** Interrupting a fiber stops it _and_
runs its finalizers, cascading through everything it started. The repo's cancel
chain is this feature end-to-end: durable intent → fiber interrupt →
`Stream.ensuring` fires an `AbortController` → the provider fetch genuinely
aborts. No hand-threaded signals; miss nothing.

**5. Cleanup is attached to the work, not remembered by the caller.** Two
combinators carry the repo's hardest guarantees:

- `Effect.onExit(finalizer)` runs on **every** exit — success, typed failure,
  defect, interrupt. `run-turn-generation.ts:52` uses it so every turn writes
  exactly one durable terminal no matter how it ended (crash, cancel,
  shutdown, success). `try/finally` cannot express this: it cannot tell an
  interrupt from a failure, and it never runs for a detached promise at
  shutdown.
- `Effect.acquireRelease(open, close)` ties a resource to a lifetime.
  `turn-subscription-stream.ts` registers an SSE subscriber this way, so a
  browser disconnect releases exactly that subscriber — the reason the
  performance review found zero leaks on the streaming path.

## Where it lives, where it is banned

| Area                                                            | Effect?                                                          | Enforced by                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `partner-ai-core`, `agent-runtime`, service inbound/composition | Yes — the home                                                   | —                                             |
| `packages/db`                                                   | Only the notification streams; repositories are plain `async`    | package convention                            |
| `ai-runtime-contract`                                           | Types on the port signatures only                                | —                                             |
| `side-chat-widget`, `chat-protocol`, `host-bridge`, `shared`    | **Banned**                                                       | `check-boundaries`, `check-dependency-policy` |
| Transport edges (routes, SSE)                                   | Conversion point: `Effect.runPromise`, `Stream.toReadableStream` | review + `check-outbound-rules`               |

## What you need to know, by role

**Touching the widget or protocol: nothing.** Those packages are Effect-free by
gate. Effect appearing in them is a boundary break, not a learning gap.

**Writing an adopter extension (tool, sink, logger): three functions.**

```ts
Effect.succeed(value); // "here is the result"
Effect.sync(() => console.log(x)); // run a synchronous function
Effect.tryPromise(() => fetch(url)); // run a promise; rejection = typed failure
```

A telemetry sink is one `Effect.sync`. A tool can use the shipped
`createRuntimeToolFromPromise` factory and avoid Effect entirely. The diagnostic
logger (ADR 0011) is plain sync — no Effect at all.

**Contributing to core/service/runtime: the working set.**

- **Sequencing:** `Effect.gen(function* () { const a = yield* stepA; ... })` —
  generators read top-down like async/await; `yield*` is the `await`. House
  rule: generators for sequencing; `.pipe` only for error/finalizer
  combinators (AGENTS.md). `prepare-stream-chat-turn.ts` is the worked
  example: nine named stages, one comment each.
- **Errors are values.** Expected failures use `Effect.fail` / `Effect.try` /
  `Effect.tryPromise` and appear in the `E` slot. A raw `throw` is a defect.
  Map foreign failures at the boundary (`mapPortFailure`, `toRuntimeError`)
  so inner code sees one typed taxonomy.
- **`Effect.promise` vs `Effect.tryPromise`:** `Effect.promise` claims "cannot
  fail" — a rejection becomes a silent defect. If the promise can reject
  (network, DB), use `tryPromise`. Notification listeners use the fallible path
  and reconnect with diagnostics when a LISTEN connection drops.
- **Fibers must be observed.** `forkDetach`/`FiberMap.run` return handles;
  either await them, register an exit observer, or log non-interrupt exits.
  The turn runner observes detached generation fibers and logs unexpected exits,
  so a lost answer cannot remain silent.
- **Verify v4 APIs against the installed `.d.ts`** under
  `node_modules/effect/dist/`, never against v3 memory, blog posts, or LLM
  training data — v3 and v4 differ (`Effect.catch` shapes, fork APIs,
  `FiberMap`), and most published material is v3.

## The two error channels (surprises everyone once)

A runtime consumer can receive failure two ways, and which one fires depends on
_when_ the failure happens:

| Failure moment                                                     | Arrives as                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| Before the stream opens (selection, model resolution, stream open) | An Effect **failure** (`AiRuntimeError` in the `E` channel) |
| After the stream opens (provider emits an error part mid-turn)     | A streamed **`runtime.error` event**, terminal              |

Handle both when consuming `streamEffect`. Core does; a custom consumer must.

## Style rules that keep it readable

The cognitive-load budget (AGENTS.md) applies _harder_ to Effect code: target
complexity 5-6, nesting ≤2. Prefer named lifecycle stages over clever inline
composition — `check-human-readability.mjs` warns on inside-out
`Stream.unwrap(Effect.gen(...))` shapes. If an Effect expression needs reading
twice, extract and name the stages.

## Files worth reading as examples

- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts` — a nine-step `Effect.gen` spine with stage comments.
- `packages/partner-ai-core/src/application/stream-chat/protocol/run-turn-generation.ts` — `onExit` finalization in 15 lines.
- `apps/partner-ai-service/src/inbound/turn-stream/turn-subscription-stream.ts` — `acquireRelease` + `Stream` for a scoped SSE subscriber.
- `apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts` — fibers in a `FiberMap`; server-owned work that outlives requests.
- `apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts` — the tool seam, Effect flavor.
