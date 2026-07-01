# ADR 0005: The Runtime Port — Engines Are Replaceable By Contract

Status: accepted 2026-07-02

## Context

A recurring stakeholder question: *"what if we later need a different agent —
a Python/LangGraph service, a hosted agent platform, a second engine beside
the first?"* The fear is that choosing the AI SDK runtime (ADR 0006) closes
that door. It does not — but the escape hatch was implicit in the code and
invisible in the record. This ADR makes it explicit.

The whole core↔runtime boundary is **one method** in a ~430-line, SDK-free,
provider-free contract package:

```ts
// packages/ai-runtime-contract
type AiRuntimePort = {
  streamEffect: (request: AiRuntimeRequest) => Stream<RuntimeEvent, AiRuntimeError>;
};
```

Core sends one prepared request and consumes normalized events. It has no
other way to reach a model — the gates forbid core from importing
`agent-runtime` at all.

## What it buys here

| Capability | How | Without it |
|---|---|---|
| **The engine is a plug, not a foundation.** | Core depends only on `ai-runtime-contract`; the shipped AI-SDK engine is one implementation of one method. | "Replace the agent framework" means rewriting product logic. |
| **Four sized doors for future needs.** | Delegate a task to another agent (a tool — no architecture change) < new provider (one adapter file) < new executor (custom loop, same contract) < whole new engine behind the port — including a remote one in another language. | Every integration question becomes a fork-vs-rewrite debate. |
| **Everything above the port is engine-agnostic.** | Auth, policy, guards, context admission, persistence, protocol mapping, the widget — none of it changes when the engine does. | Engine migration drags the whole product with it. |
| **Engines are testable in isolation.** | The contract is small enough to fake: the deterministic scripted engine drives the full product offline today. | Integration tests requiring live agent infrastructure. |

## Decision

`AiRuntimePort` (in `packages/ai-runtime-contract`) is the **only** door
between product core and any generation engine. The contract stays small,
SDK-free, and provider-free; an implementation owes exactly four things:

1. Emit only `RuntimeEvent`s — never provider or framework types.
2. End every stream with exactly one terminal (`completed`/`error`/`blocked`).
3. Honor the request's abort signal (cancel must genuinely stop work).
4. Map failures into the `AiRuntimeError` taxonomy with scrubbed messages.

Integration needs are answered at the **smallest sufficient level**, in order:

- **Level 0 — delegate a task to another agent: a tool.** When the *current*
  orchestrator needs a specialist agent for one bounded task ("analyze this
  contract", "query the fleet-ops agent"), that agent is registered as a
  `RuntimeTool` whose execute calls the agent's API and returns its result.
  The model decides when to call it, the result feeds the loop, the UI shows
  it as a tool row. **No architecture change at all** — this is the answer to
  "what if the orchestrator needs to talk to another agent". Boundary: a
  bounded task with schema'd input/output is a tool; hosting an open-ended
  multi-agent workflow behind one tool call stays a non-goal
  ([requirements](../product/requirements.md)) — if a whole turn should be
  someone else's agent loop, that is Level 2 or 3.
- **Level 1 — new provider:** an adapter file inside `agent-runtime`
  (OpenAI/Azure shipped; the pattern is ~130 commented lines).
- **Level 2 — new executor:** a custom loop implementing `AgentExecutor`
  inside `agent-runtime`, selected per turn profile — e.g. a profile whose
  whole turn is answered by a different agent system.
- **Level 3 — new engine:** an independent `AiRuntimePort` implementation.
  A thin TypeScript adapter can front a **remote engine in any language** (a
  Python/LangGraph service, a hosted agent API), translating its wire events
  into `RuntimeEvent`s. The product does not know or care. Mechanics for
  levels 0 and 3: [runtime-port.md](../architecture/runtime-port.md).

## Alternatives rejected

- **Letting core call engines directly** — every engine choice becomes
  load-bearing forever; the port is what keeps ADR 0006 a low-stakes decision.
- **A fatter port** (tool registration, provider config, orchestration hooks
  in the contract) — every field added to the contract is a field every
  future engine must honor; small contract, replaceable engines.
- **Building multi-engine orchestration now** — no product need; the port
  makes it possible later without making it complex today.

## Consequences

"What if we need another agent" has a standing answer: implement one method,
honor four obligations, keep the product untouched — and prove it with the
same contract tests the fake engine passes. The owned costs: a Level-3 engine
must speak Effect `Stream` at the seam (`Stream.fromAsyncIterable` is the
bridge — a thin adapter concern), and the request is per-turn stateless
(`AiRuntimeMessage` carries user/assistant/system roles only), so an engine
needing cross-turn agent state manages it itself, keyed by `conversationId`.
