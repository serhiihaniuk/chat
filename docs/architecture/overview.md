# Architecture Overview

Side Chat is an embeddable AI harness for ordinary web applications. The product
is not one chatbot with one prompt and one tool. It is a framework that lets host
apps safely expose context, tools, commands, retrieval sources, memory, profiles,
and workflows through one governed assistant pipeline.

The production source of truth is `docs/architecture/production-system-design.md`.
The execution plan is `docs/architecture/implementation-plan.md`.

## Target Shape

```txt
host capability manifest
-> policy/profile resolution
-> conversation and turn lifecycle
-> context manager
-> optional workflow engine
-> agent runtime
-> streamed protocol events
-> durable event/tool/usage/context records
-> compaction, memory extraction, and eval feedback
```

## Package Ownership

- `apps/partner-ai-service` owns HTTP, composition, adapters, config, startup,
  and transport conversion.
- `packages/partner-ai-core` owns the product harness: policy decisions, turn
  lifecycle, context management, context manifests, tool exposure decisions,
  workflow orchestration, typed errors, and Effect service wiring.
- `packages/agent-runtime` owns one prepared assistant turn: provider/model
  execution, runtime tool protocol, AI SDK adapter code, and normalized runtime
  events.
- `packages/chat-protocol` owns request, event, schema, and SSE contracts.
- `packages/chat-client`, `packages/host-bridge`, and
  `packages/side-chat-widget` own browser-facing integration.
- `packages/db` owns schema contracts, Drizzle schema, and repository adapters.

Public package consumers use package entrypoints. Relative imports must not cross
package, app, or harness seams.

## Core Rules

- `partner-ai-core` is the owner of "what the model sees."
- `agent-runtime` executes prepared turns; it must not own product context
  policy, retrieval, memory, or host-app behavior.
- Host apps register capabilities through a manifest instead of passing
  arbitrary context/tools directly to the model.
- Tool registration is not permission. Tool exposure is resolved per turn or per
  workflow node and should fail closed.
- Assistant turns are durable before model execution starts.
- Long conversations are expected; context budgets, summaries, compaction,
  memory, and retrieval are first-class harness concepts.
- Multi-agent workflows require isolated context, budgets, artifacts, handoffs,
  cancellation, and audit. They are not just tools that call another model.

Server/core workflows are Effect-first. `partner-ai-core` ports use Effect for
async/failing dependencies, `agent-runtime` exposes an Effect stream for
assistant turns, and `partner-ai-service` adapts HTTP/database/provider edges
into those workflows. Browser/client/widget public interfaces remain plain
protocol and React-friendly TypeScript.

Testing architecture is part of the system design. See
`docs/architecture/testing-system-design.md` for current test lanes. The target
architecture adds AI evals for context, retrieval, memory, tool use, workflows,
and safety.
