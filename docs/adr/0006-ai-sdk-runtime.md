# ADR 0006: AI SDK Runtime Behind A Provider-Neutral Contract

Status: accepted (rebaselined 2026-07-01, expanded 2026-07-02)

## Context

The runtime must call real model providers, run a tool loop, and stream — but
product code must never couple to a vendor SDK or its stream shapes. The
product itself is an **embedded assistant inside a TypeScript web product**:
the hard engineering lives in the protocol, the streaming lifecycle, and the
widget — the agent loop is deliberately simple (one model, one tool loop;
multi-agent orchestration is an explicit non-goal, see
[requirements](../product/requirements.md)).

## What the AI SDK buys here

| Capability                                                                                                                    | In this repo                                                                                                                                                                                        | Without it                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Provider neutrality where it commercially matters.** One interface over OpenAI, Azure, Anthropic, Google, and local models. | OpenAI and Azure adapters shipped, swapped via `sidechat.config.ts`; adding a provider is one adapter file ([extension-seams.md](../architecture/extension-seams.md)).                              | Hand-written streaming + auth + retry per provider; switching models becomes a project. |
| **Maintained streaming/tool-loop machinery.** Typed stream parts, tool loop with step caps, abort propagation.                | The tool loop, delta streams, and abort chain ride the SDK; we map its parts to our events once.                                                                                                    | Re-implementing the least differentiated, most fiddly layer of the stack.               |
| **One type system, widget to provider call.**                                                                                 | The three event vocabularies are compile-checked end to end; adding an event that misses a mapping fails the build. This is also the AI-assistance harness (ADR 0003) extended to the runtime edge. | A language boundary where contracts become hand-synced JSON and drift silently.         |
| **A small, confined surface.**                                                                                                | We use models, streaming, and the tool loop — nothing else; all of it inside one package.                                                                                                           | —                                                                                       |

## Decision

The AI SDK (`ai`, `@ai-sdk/*`) is the runtime engine, importable **only inside
`packages/agent-runtime`** — enforced by gate scripts, not convention. The
public runtime surface is Agent-first and Effect-first (`streamEffect` exposing
`Stream<RuntimeEvent, AiRuntimeError>`); shared request, error, and event
contracts live in `@side-chat/ai-runtime-contract`, which is SDK-free and
provider-free. AI SDK stream parts map to normalized `RuntimeEvent`s before
anything leaves the package; a provider or SDK type crossing that line fails
CI.

- Expected failures are values in the Effect error channel; raw `throw` is a
  defect, mapped at the boundary as a safety net.
- Runtime tools are Effect-shaped; the only Promise bridge is the private AI
  SDK adapter, with abort and timeout handling.
- Tools are model-driven: the model decides when to call a registered tool.
  Backend keyword heuristics and pre-model tool execution are rejected.
- The `AgentExecutor` seam allows alternative engines beside the default
  tool-loop executor without touching the contract.
- Requests set `store: false` until a data-use policy says otherwise. The
  deterministic fake provider implements the real `LanguageModelV3` streaming
  interface, so the actual loop runs offline in tests.

## Objections answered

Two objections come up when this decision is presented. The answers belong in
the record.

**"It's from Vercel — we're vendor-locking ourselves."** Three facts. First,
the AI SDK is MIT-licensed open source that runs anywhere Node runs; it has no
coupling to Vercel hosting — Vercel is its steward the way Meta stewards React.
Adopting React does not lock you to Meta's cloud; same relationship here.
Second, the lock-in that actually costs money is **model-provider** lock-in,
and the SDK is the tool that _removes_ it: provider switching is config, not a
rewrite. Third — the structural answer — this architecture treats the SDK as
replaceable by construction: it is confined to one package behind an SDK-free
contract, the gates fail CI on any leak, and the 2026-07-01 review verified no
SDK type escapes. Worst case, replacing the AI SDK is a rewrite of one
package's internals while the widget, protocol, core, and service stay
untouched. We did not just pick a library; we built a firewall around it.

**"We should use Python + LangGraph instead."** LangGraph is a good tool for
what it is for: graph-orchestrated, multi-step agent systems in the Python ML
ecosystem. This product is not that. The assistant here is a feature of a
TypeScript web product; its risk concentrates in the protocol, the streaming
lifecycle, and the UI — and its agent loop is deliberately one tool loop, with
multi-agent workflows an explicit non-goal. Choosing Python would buy
orchestration power the product does not use, and pay for it with: a second
runtime stack to build, deploy, hire for, and operate; the loss of the single
type system (browser↔service↔runtime contracts become hand-synced JSON across
a language gap); and a network hop inserted into the hardest part of the
system, the streaming hot path. There is also an irony worth naming: LangGraph
couples your _domain orchestration_ to its framework abstractions — graphs,
checkpointers, framework types through your business logic — which is a deeper
lock-in than a stream-mapping SDK confined to one package ever could be. And
the door is not closed: if a Python engine is ever genuinely justified, it can
implement `AiRuntimePort` behind the same contract as an adapter, without
touching product code. That escape hatch is its own decision record —
[ADR 0005](0005-runtime-port-replaceable-engines.md), with the mechanics in
[runtime-port.md](../architecture/runtime-port.md). The seam already exists;
nothing forces it today.

## Alternatives rejected

- **Raw provider SDKs / HTTP per provider** — re-implements streaming, tool
  loops, and abort per vendor; the exact undifferentiated work the SDK owns.
- **LangChain.js / LangGraph.js** — heavier framework abstractions that soak
  into domain code; this repo needs a thin engine behind a contract, not a
  framework to live inside.
- **Python + LangGraph sidecar** — see above; rejected for this product, kept
  possible through `AiRuntimePort`.

## Consequences

Product logic never sees a provider type, and providers swap via config. The
costs are owned: the SDK version is pinned exactly, stream parts the mapper
does not recognize are dropped, so **every SDK upgrade requires a mapping
review** (an ignore-set with a log-once backstop is `plan/18`); and the SDK's
tool-loop defaults (step cap) must be surfaced, not trusted invisibly
(`plan/22`).
