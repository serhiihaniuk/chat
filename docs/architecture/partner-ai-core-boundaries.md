# Backend Boundaries

`packages/partner-ai-core` follows hexagonal boundaries and is the target
product harness module:

- `domain/` contains pure authority and product concepts.
- `application/` contains use cases such as `stream-chat`.
- `ports/` contains interfaces for runtime, persistence, authorization, policy,
  observability, context, retrieval, memory, tools, workflows, and host
  capabilities as those modules are introduced.
- `policies/` contains pure decision logic.
- `errors/` contains typed application errors.
- `services/` contains Effect runtime service tags and layers.

Infrastructure packages and apps implement ports. Backend core must not import Hono, Drizzle, Postgres, React, widget code, browser clients, or provider SDKs.

Core ports are Effect-first. Async/failing work is represented with
`Effect.Effect`, and long-running assistant output is represented with
`Stream.Stream`. Promise-based libraries are adapted at the app/package edge
before they enter core. This keeps retries, cancellation, typed failures,
resource cleanup, and stream composition in one workflow model while still
keeping browser-facing APIs plain TypeScript.

`stream-chat` exposes one core surface:

- `streamChatEffect(input)` is the core workflow and returns
  `Stream<SidechatStreamEvent, PartnerAiCoreError>`.

The HTTP service provides ports through `createPartnerAiCoreLayer(...)`, calls
`streamChatEffect`, and converts to `AsyncIterable` only at the SSE response
boundary.

Do not add package-level Promise or `AsyncIterable` wrappers for core use cases.
Those shapes belong to inbound or outbound adapters when a platform API requires
them.

Context-board construction belongs in this core seam. The core decides what
context can be trusted, redacted, squashed, persisted, and sent to the runtime;
apps implement the IO adapters. `agent-runtime` only receives a prepared
`RuntimeContextBoard` and renders it.

The target architecture deepens this into a context manager and workflow engine.
Core owns the interfaces for:

- host capability manifests;
- policy/profile resolution;
- turn lifecycle;
- context candidates, budgets, rendering, snapshots, and manifests;
- history summaries and compaction;
- memory extraction and selection;
- retrieval query results as context candidates;
- tool exposure and tool-result lifecycle;
- workflow runs, nodes, artifacts, handoffs, and cancellation.

These are product harness modules. They should not move into `agent-runtime`,
the widget, the HTTP edge, or host app glue code.

Expected failures belong in the Effect error channel. Use `Effect.fail`,
`Effect.try`, or `Effect.tryPromise` for known auth, policy, persistence,
runtime, and observability failures. Raw `throw` is a defect, not normal control
flow.
