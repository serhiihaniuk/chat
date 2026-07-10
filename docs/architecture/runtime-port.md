# The Runtime Port

Read this when: you need another agent in the picture — delegating one task to a specialist, a new provider, a custom loop, or a whole external engine (Python/LangGraph, a hosted platform) — and want to know where it plugs in.
Source of truth for: the `AiRuntimePort` contract, an implementation's obligations, the four integration levels (including agent-as-tool delegation), and the remote-engine adapter pattern.
Not source of truth for: why engines are replaceable ([ADR 0005](../adr/0005-runtime-port-replaceable-engines.md)), the shipped AI-SDK engine ([ADR 0006](../adr/0006-ai-sdk-runtime.md)), or the event vocabulary ([runtime-and-protocol-events.md](runtime-and-protocol-events.md)).

Product core never talks to a model, an SDK, or an agent framework. It talks to
one port, defined in the SDK-free contract package
`packages/ai-runtime-contract`:

```ts
type AiRuntimePort = {
  streamEffect: (request: AiRuntimeRequest) => Stream<RuntimeEvent, AiRuntimeError>;
};
```

One prepared request in; a stream of normalized events out. Everything above
the port — auth, policy, guards, context admission, persistence, protocol
mapping, the widget — is engine-agnostic and does not change when the engine
does. That is the whole answer to "what if we need to connect another agent":
implement this method.

## What the request carries, what the stream owes

`AiRuntimeRequest` is core's finished work: resolved messages
(user/assistant/system), system instructions, the selected model and reasoning
policy, the per-turn tool scope, and an abort signal. The engine renders and
runs it — it never re-decides policy.

An implementation owes four things:

| Obligation                     | Meaning                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Speak only `RuntimeEvent`.** | `started`, `output_delta`, `activity`, `completed`, `error`, `blocked` — never provider or framework types. Core maps these to `sidechat.v1`; the browser never sees anything else. |
| **Exactly one terminal.**      | Every stream ends with one `completed`, `error`, or `blocked`, and nothing after it (`isRuntimeTerminalEvent` is exported for exactly this).                                        |
| **Honor the abort signal.**    | A fiber interrupt aborts the request's signal; the engine must stop real work (cancel a fetch, close a remote stream) — cancel is a product guarantee, not a suggestion.            |
| **Typed, scrubbed failures.**  | Expected failures are `AiRuntimeError` values with public-safe messages; raw engine/provider errors never cross the port.                                                           |

## Four integration levels — use the smallest that fits

| You need                                                                          | Level                 | What you write                                                                      | Where                                                                          |
| --------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| The current orchestrator consulting another agent for one task                    | **0 — Agent-as-tool** | A `RuntimeTool` whose execute calls the agent's API                                 | The normal tool seam; section below                                            |
| Another model vendor                                                              | **1 — Provider**      | One adapter file (~130 lines; Azure adapter is the worked example) + a config entry | Inside `agent-runtime`; [extension-seams.md](extension-seams.md)               |
| Different loop behavior (planner, critic pass, custom stop rules)                 | **2 — Executor**      | An `AgentExecutor` emitting `RuntimeEvent`s, selected per turn profile              | Inside `agent-runtime`; the deterministic test executor is the minimal example |
| A different engine entirely — another framework, another language, a hosted agent | **3 — Engine**        | An `AiRuntimePort` implementation                                                   | Anywhere; wired in service composition in place of the default runtime bundle  |

## Level 0: delegating to another agent mid-turn (agent-as-tool)

The most common "connect to another agent" need is not a new engine — it is
the shipped orchestrator consulting a specialist for one bounded task. In this
architecture **that agent is a tool**: register a `RuntimeTool` whose execute
calls the agent's API, declare its input schema and description, and the model
decides when to delegate — same as claude.ai's own sub-agents, same shape as
MCP.

```txt
model ── calls tool "contract_analyst" ──▶ RuntimeTool.execute
                                              │ POST to the specialist agent
                                              ▼
                                    specialist agent (any language)
                                              │ returns a JSON result
model ◀── tool result feeds the loop ────────┘
UI: one activity row — "contract_analyst · running → completed"
```

What you get for free at this level: profile allowlisting decides which turns
may delegate; abort propagates (cancelling the turn aborts the delegation);
the tool timeout bounds a slow agent; the result rides the normal tool-result
path back to the model and the timeline. The whole adapter can use
`createRuntimeToolFromPromise` to wrap one HTTP call.

Two honest constraints, and one boundary:

- **Results return whole, not streamed.** A delegated task shows as a running
  tool row until it completes; the sub-agent's tokens do not stream into the
  UI. Fine for bounded tasks; a sign you want Level 2/3 if not.
- **Depth is bounded by the configured tool-loop step cap** — delegation cannot
  recurse unboundedly.
- **Boundary:** a bounded task with schema'd input/output is a tool. Hiding an
  open-ended multi-agent workflow behind one tool call is an explicit non-goal
  ([requirements](../product/requirements.md)); if a whole turn should be
  another agent system's loop, that is an executor or an engine, below.

Level 3 is deliberately boring. The shipped AI-SDK engine is just the default
occupant of the port — the deterministic fake engine that drives all offline
tests is _already a second, complete implementation_, which is the existence
proof that the seam works.

## The remote-engine pattern (the "Python/LangGraph" answer)

An external agent connects through a **thin TypeScript adapter** — the remote
service does not need to know Effect, TypeScript, or this repo:

```txt
core ──AiRuntimeRequest──▶ TS adapter (implements streamEffect)
                              │  POST /run  (JSON: messages, model, tools)
                              ▼
                    your agent service (Python/LangGraph/anything)
                              │  streams its own events (SSE/NDJSON)
                              ▼
                  adapter maps each wire event → RuntimeEvent
                  (Stream.fromAsyncIterable + error mapping)
```

The adapter's jobs, top to bottom: serialize the request onto your wire; open
the stream; `Stream.fromAsyncIterable` over the response; map each remote
event to a `RuntimeEvent` (your tool steps become `activity` rows, your tokens
become `output_delta`); translate the abort signal into closing the remote
call; end with exactly one terminal; wrap transport failures as
`AiRuntimeError`. Fifty to a hundred lines of adapter for a fully foreign
engine.

Two design facts a remote engine must plan around:

- **The request is per-turn and stateless.** Messages carry
  user/assistant/system roles only — there is no cross-turn tool history in
  the contract. An agent that keeps its own long-lived state manages it
  itself, keyed by `conversationId` from the request ids.
- **Host commands and runtime tools are engine responsibilities.** The tool
  scope on the request says what the model may call; a Level-3 engine either
  executes tools itself and reports them as `activity` events, or does not
  offer them. The shipped engine's tool registry does not follow the port.

## What never changes when the engine changes

Worth stating because it is the point: swapping Level 3 touches **zero** lines
of auth, policy, context admission, persistence, protocol, service routes, or
widget. The turn lifecycle ([assistant-turn.md](assistant-turn.md)) — pre-start
stages, finalization, exactly-one-terminal, cancel, idempotency — wraps
_around_ the port and keeps working, because those guarantees were never the
engine's job.

## Files to open

- `packages/ai-runtime-contract/src/index.ts` — the whole contract, ~430 lines.
- `packages/agent-runtime/src/runtime/agent-runtime.ts` — the default engine's entry.
- `packages/agent-runtime/src/testing/` — the deterministic engine: the second implementation, and the template for a third.
- `apps/partner-ai-service/src/composition/runtime/` — where the port is wired into the service.
