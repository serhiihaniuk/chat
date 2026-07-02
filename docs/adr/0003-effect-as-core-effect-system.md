# ADR 0003: Effect As The Core Effect System, Strictly Contained

Status: accepted 2026-07-02

## Context

The core problem is long-running, server-owned generation with hard lifecycle
guarantees: exactly one terminal per turn across success/failure/crash/cancel,
cancellation that genuinely aborts the provider call, and SSE subscribers whose
resources release on disconnect. Hand-rolling that with promises, `finally`
blocks, and `AbortController` plumbing is where streaming backends historically
rot.

Two more facts shape the decision. The template's adopters are ordinary web
developers who do not know Effect. And this repo is built with heavy AI
assistance — code quality depends on errors surfacing at typecheck time, not
at runtime after an edit.

## What Effect buys here

Each row names the capability, the place in this repo where it is load-bearing
today, and what the same guarantee costs in plain `async`/`await`:

| Capability                                                                                                                                                                                                            | Load-bearing here                                                                                                                                                                                                    | Without Effect                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Fibers: supervised long-lived async.** A turn runs on a fiber that outlives the HTTP request, tracked in a `FiberMap` keyed by turn id — startable, findable, interruptible.                                        | `turn-runner.ts` — generation survives the browser closing; cancel finds the exact fiber.                                                                                                                            | A detached floating promise: no handle, no cancellation, no supervision, invisible failures.                              |
| **`onExit`: finalization on _every_ exit path** — success, typed failure, defect (a bug), interrupt (cancel or shutdown) — one code path, guaranteed to run.                                                          | `run-turn-generation.ts:52` — the exactly-one-terminal product guarantee; every turn reaches a durable terminal no matter how it ended.                                                                              | `try/finally` cannot distinguish cancellation from failure, and nothing runs `finally` on a detached promise at shutdown. |
| **Structured interruption: cancellation that propagates.** Interrupting a fiber runs its finalizers and cascades through everything it started.                                                                       | Cancel → fiber interrupt → `AbortController` → the provider fetch **actually aborts** (no tokens burned after Stop).                                                                                                 | Threading abort signals by hand through every layer; miss one and cancel becomes cosmetic.                                |
| **Scoped resources: acquire/release tied to a lifetime.**                                                                                                                                                             | `turn-subscription-stream.ts` — an SSE disconnect releases exactly its subscriber; the perf review found zero leaks and bounded memory on the hot path.                                                              | Manual cleanup registries and `removeListener` bookkeeping — the classic slow-leak source.                                |
| **Typed error channels: expected failures are values in the signature.** A raw `throw` is a defect, not control flow.                                                                                                 | Every port (`StreamChatPorts`, `AiRuntimePort`) declares what can fail; callers must handle it or the code does not compile.                                                                                         | `catch (e: unknown)` at every call site; nothing forces handling; failure taxonomies drift.                               |
| **Dependency injection without a framework.** Effects are lazy descriptions, so capabilities arrive as plain injected port objects; tests swap in fakes with zero mocking libraries.                                  | `composePartnerAiService` wires real adapters; `src/testing/stream-chat/` fakes drive the whole spine in unit tests. Deliberately plain ports objects — not Effect Layers (`plan/24` deletes the unused Layer path). | Module-level singletons or a DI container dependency; mock frameworks patching imports.                                   |
| **Backpressure-aware streams.** Pull-based `Stream` → `toReadableStream`; a slow client pulls slower instead of ballooning server memory.                                                                             | `sse.ts` — the perf review's cleanest area: no unbounded buffers anywhere on the streaming path.                                                                                                                     | Hand-rolled `ReadableStream` controller loops with manual high-water-mark logic.                                          |
| **An AI-assistance harness** (owner-observed, a real driver): typed channels + strict composition make AI-generated changes fail the typecheck instead of producing an app that silently doesn't start after an edit. | The whole server path; compounds with the governance gates.                                                                                                                                                          | Runtime debugging loops after every AI edit.                                                                              |

The 2026-07-01 review's strongest findings cut both ways honestly: the repo's
best guarantees exist _because_ of these capabilities, and the review's worst
server bugs (stranded turns, silent listener death) came from the two places
that _bypassed_ the discipline — an unobserved fiber and an `Effect.promise`
that swallowed failures. The lesson is to apply the model consistently, not
that the model failed.

## Decision

**Effect v4 is the concurrency and effect system for the server path** — core,
service, runtime, and the db notification streams — and **nowhere else**:

- Containment is gate-enforced, not conventional: `side-chat-widget`,
  `chat-protocol`, `host-bridge`, and `shared` are Effect-free; repositories
  are plain `async`; Promise/`ReadableStream` conversions live only at
  transport edges ([package-boundaries.md](../architecture/package-boundaries.md)).
- Every seam an adopter touches is Effect-optional or Effect-trivial: tools get
  a promise-based factory (`plan/21`), the diagnostic logger is plain sync
  (ADR 0011), a telemetry sink needs `Effect.sync`/`Effect.tryPromise` and
  nothing more.
- House style: `Effect.gen` generators over `.pipe` chains for sequencing;
  expected failures are values (`Effect.fail`/`try`/`tryPromise`); a raw
  `throw` is a defect, not control flow (AGENTS.md; the readability gates
  police inside-out composition).

**Why the v4 beta, deliberately** (owner decision): v4's API is finalizing and
in substance final; it will reach stable before this app ships. Pinning v4 now
means the stable release is a pin bump, and the alternative — building on v3 —
would guarantee a real migration. The exact version pin plus the standing rule
"verify APIs against the installed `.d.ts`, never against v3 memory or LLM
training data" contains the remaining drift risk.

## Alternatives rejected

- **Plain `async`/`await` + `AbortController`** — hand-rolled finalization and
  interruption is exactly the bug class Effect eliminates here; see the
  right-hand column above for the itemized cost.
- **fp-ts / neverthrow** — typed errors without the runtime: no fibers, no
  structured interruption, no resource scopes; the hard part stays hand-rolled.
- **RxJS** — streams without typed error channels or scoped resources, and its
  operator-chain style fights the human cognitive-load budget.
- **Effect v3** — stable today, guaranteed migration tomorrow.

## Consequences

The double learning curve (agents + Effect) is real and is managed by the
containment line, not wished away. The line must hold: **Effect never spreads
outward** — a change that adds Effect to the widget, the protocol, or an
adopter-facing signature should be rejected in review and pointed here. The
newcomer path is [effect.md](../architecture/effect.md), which owns what each
role actually needs to know. When v4 goes stable, bump the pin in one change
and re-run the full gate.
