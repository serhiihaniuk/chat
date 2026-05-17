# Code Walkthrough

Status: practical learner map

Use this document when you want to understand where code lives, why it lives there, and what problem each area solves. The bigger architecture story is in [SYSTEM-DESIGN.md](../SYSTEM-DESIGN.md). This file is closer to a guided tour of the repo.

## The Mental Model

This project is split around one product boundary: `sidechat.v1`.

The browser-facing assistant should not know about OpenAI stream chunks, AI SDK internals, database tables, Hono route details, or a future Python agent service. It should know one stable contract: side-chat request in, side-chat stream events out.

That is the main architecture lesson:

```txt
Host app
  -> reusable widget
    -> sidechat.v1 protocol
      -> Hono inbound adapter
        -> streamChat application use case
          -> ports
            -> model / tools / DB / reports / auth / telemetry adapters
```

Hexagonal architecture means the center of the system talks in its own language. Frameworks and vendors stay at the edges. In this repo:

- The shared protocol owns the wire language.
- The backend application owns the chat workflow.
- Ports describe what the workflow needs from the outside world.
- Adapters translate concrete tools, models, HTTP, DB, or browser APIs into those ports.
- React UI renders widget state; it does not own the backend protocol or model provider logic.

## Read The Repo In This Order

1. [packages/shared-protocol/LEARNING.md](../packages/shared-protocol/LEARNING.md)
   Start here because this is the product contract. It defines the request DTO, stream events, host commands, SSE codec, and validation helpers.

2. [apps/side-chat-api/LEARNING.md](../apps/side-chat-api/LEARNING.md)
   Then read the backend ports. This tells you what the backend workflow needs without telling you which framework or vendor provides it.

3. [packages/db/LEARNING.md](../packages/db/LEARNING.md)
   Read the persistence boundary before reading API composition. It explains why runtime DB access is stored-procedure/function based.

4. [apps/dashboard-data-api/LEARNING.md](../apps/dashboard-data-api/LEARNING.md)
   Read the host dashboard data service. It shows the read-only API path from browser to DB package.

5. [packages/side-chat-widget/LEARNING.md](../packages/side-chat-widget/LEARNING.md)
   Read the widget as a frontend hexagon: `ports`, `domain`, `application`, `adapters/react`, then `ui`.

6. [apps/embedded-host-app/LEARNING.md](../apps/embedded-host-app/LEARNING.md)
   Read the realistic host. It owns the Workbench page, host-surface context, table state, and command application.

7. [apps/widget-demo/LEARNING.md](../apps/widget-demo/LEARNING.md)
   Finish with the minimal package consumer. It shows the widget outside the Workbench host.

## Local Learning Guides

| Guide | What to learn there |
| --- | --- |
| [Shared Protocol](../packages/shared-protocol/LEARNING.md) | `sidechat.v1`, Effect Schema ownership, SSE events, validation, sequence rules. |
| [Side-Chat API](../apps/side-chat-api/LEARNING.md) | Hono boundary, `streamChat`, ports, AI SDK adapter, workbench tools, reports, usage. |
| [DB Package](../packages/db/LEARNING.md) | `pg` isolation, stored procedures/functions, chat persistence, dashboard reads. |
| [Dashboard Data API](../apps/dashboard-data-api/LEARNING.md) | Read-only dashboard service, fixture vs Postgres source, host data endpoints. |
| [Side-Chat Widget](../packages/side-chat-widget/LEARNING.md) | Frontend hexagon, React adapter, message projection, host bridge, UI slices. |
| [Embedded Host App](../apps/embedded-host-app/LEARNING.md) | UBS Partner page, host-surface registry, command application, citation highlighting. |
| [Widget Demo](../apps/widget-demo/LEARNING.md) | Minimal public-package consumer and callback smoke path. |

## Full App Flows

### Chat Stream Flow

```txt
User sends a message in the widget
  -> packages/side-chat-widget/src/adapters/react/use-side-chat.ts
  -> POST /chat/stream with X-Sidechat-Protocol: sidechat.v1
  -> apps/side-chat-api/src/inbound/hono/routes/chat-stream.ts
  -> apps/side-chat-api/src/application/stream-chat.ts
  -> ModelPort.stream
  -> apps/side-chat-api/src/adapters/ai/openai-model.ts or fake-model.ts
  -> sidechat.v1 SSE events
  -> widget stream decoder
  -> widget message domain projection
  -> rendered conversation UI
```

### Dashboard Data Flow

```txt
Embedded host page loads
  -> apps/embedded-host-app/src/features/advisory-workbench/api/advisory-dashboard-client.ts
  -> GET /advisory-dashboard/snapshot
  -> apps/dashboard-data-api/src/app.ts
  -> AdvisoryDashboardReader
  -> packages/db/src/advisory-dashboard.ts
  -> ubs_get_advisory_dashboard_snapshot(...)
  -> Workbench page renders KPIs, table, and insight rail
```

### Host Command Flow

```txt
Model decides the table should change
  -> AI SDK host_command tool
  -> openai-model.ts validates output as HostCommand
  -> streamChat emits sidechat.host_command
  -> use-side-chat.ts dispatches through SideChatHostBridge
  -> HostSurfaceProvider calls active host registration
  -> side-chat-host.ts validates resource support
  -> AdvisoryWorkbenchPage receives sidechat:host-command
  -> grid-view-state.ts updates local table view
```

### Persistence And Usage Flow

```txt
streamChat persists user/assistant messages and token usage
  -> ConversationRepository / UsagePort
  -> default-deps.ts chooses Postgres or memory adapter
  -> packages/db/src/index.ts
  -> sidechat_* stored procedures/functions
  -> /chat/history and /chat/usage read back through ports
```

## Technology Map

| Technology | What it solves here | Where to read |
| --- | --- | --- |
| Effect Schema | One source of truth for protocol DTOs and runtime decoding of unknown JSON. | [Shared Protocol](../packages/shared-protocol/LEARNING.md), [Side-Chat API](../apps/side-chat-api/LEARNING.md), [Side-Chat Widget](../packages/side-chat-widget/LEARNING.md) |
| AI SDK | Provider/tool streaming adapter behind `ModelPort`. It is not the browser protocol. | [Side-Chat API](../apps/side-chat-api/LEARNING.md) |
| Hono | HTTP and SSE adapter layer for backend apps. | [Side-Chat API](../apps/side-chat-api/LEARNING.md), [Dashboard Data API](../apps/dashboard-data-api/LEARNING.md) |
| React | Rendering and browser lifecycle in host and widget. | [Side-Chat Widget](../packages/side-chat-widget/LEARNING.md), [Embedded Host App](../apps/embedded-host-app/LEARNING.md), [Widget Demo](../apps/widget-demo/LEARNING.md) |
| Postgres / `pg` | Runtime persistence and dashboard reads behind stored procedures/functions. | [DB Package](../packages/db/LEARNING.md) |
| Zod | Adapter-local runtime parsing where a boundary expects it: env config, DB result rows, AI SDK tool input schemas. | Side-chat API, dashboard-data API, DB package |

## Shared Protocol Package

| File | What it owns | Why it exists |
| --- | --- | --- |
| `contracts.ts` | Header names, route names, protocol version, request/response header schemas. | Keeps HTTP contract strings in one place so routes, widget, and tests do not invent their own spelling. |
| `schemas.ts` | Effect Schema definitions for requests, messages, events, host commands, citations, and usage. | Effect Schema is the source of truth. Types and runtime decoders come from the same definitions. |
| `types.ts` | TypeScript types derived from schemas. | Lets code depend on named types without duplicating the schema shape. |
| `validation.ts` | `parse*` and `validate*` helpers. | Separates two use cases: fail fast when invalid data is exceptional, or return issues when the caller must respond gracefully. |
| `codec.ts` | SSE frame encode/parse helpers. | Keeps streaming wire formatting out of React and Hono code. |
| `sequence.ts` | Stream ordering rules. | Protects the protocol from impossible streams, such as deltas after a terminal event. |

Teaching point: Zod is not needed here because Effect Schema can own both the static type and runtime decoder. If another library later needs JSON Schema, Standard Schema, or Zod-shaped input, that should be an adapter generated from or mapped from this contract, not a second source of truth.

### Protocol Flow

`sidechat.v1` is the browser/backend product protocol. It has two halves:

```txt
Request JSON
  -> SidechatRequestSchema
  -> workspaceId + optional conversationId
  -> user ChatMessage
  -> ModelSelection
  -> optional HostContextSnapshot

Response stream
  -> text/event-stream frames
  -> each frame carries one SidechatStreamEvent
  -> terminal event is sidechat.completed or sidechat.error
```

The request is intentionally not an AI SDK request. It does not contain provider messages, OpenAI response options, raw tool definitions, or database queries. It contains the product-level things the widget and server agree on: workspace, conversation, user message, selected model, and host-page context.

The response is intentionally not an OpenAI stream. It contains product events the UI can render:

| Event | Meaning | Who emits it | Who uses it |
| --- | --- | --- | --- |
| `sidechat.started` | Assistant message has begun. | `streamChat`. | Widget creates the active assistant message. |
| `sidechat.delta` | More assistant text. | Model adapter chunk mapped by `streamChat`. | Widget appends visible text. |
| `sidechat.reasoning` | Reasoning/status summary text. | Model adapter chunk mapped by `streamChat`. | Widget renders a reasoning part. |
| `sidechat.tool` | Backend tool lifecycle. | Model adapter chunk mapped by `streamChat`. | Widget renders tool running/completed/error state. |
| `sidechat.host_command` | Assistant requests a host UI action. | Model adapter validates tool result, then `streamChat` emits command event. | Widget calls the host bridge and shows command status. |
| `sidechat.completed` | Stream finished successfully. | `streamChat`. | Widget stops streaming and records usage metadata. |
| `sidechat.error` | Stream failed. | SSE adapter or application error mapping. | Widget shows error and stops streaming. |
| `sidechat.history` | Historical conversation payload. | History route. | Widget hydrates prior messages. |

### Contract File And Function Map

| File / function | Role in the protocol |
| --- | --- |
| `schemas.ts / SidechatRequestSchema` | Defines the exact JSON body accepted by `/chat/stream`. This is the “client can ask for a chat turn” shape. |
| `schemas.ts / HostContextSnapshotSchema` | Defines what the host app may tell the assistant about the current page: resources, columns, capabilities, and metadata. This is context, not trusted data authority. |
| `schemas.ts / HostCommandSchema` | Defines the controlled UI commands the assistant may request: apply grid view, clear grid view, focus resource, or custom host command. |
| `schemas.ts / SidechatStreamEventSchema` | Union of all stream events the browser can receive. This is the main product protocol surface. |
| `schemas.ts / protocolArtifacts` | String constants for event names. Use these where code needs stable names instead of retyping string literals. |
| `types.ts / SchemaType` | Converts Effect Schema output types into mutable TypeScript DTOs. Effect schemas often produce readonly structures; app DTOs are easier to use as mutable plain objects. |
| `validation.ts / parseSidechatRequest` | Fail-fast decoder for code paths where invalid input should throw. |
| `validation.ts / validateRequest` | Safe decoder for HTTP routes that must return a 400 instead of throwing. |
| `validation.ts / validateStreamEvent` | Safe decoder for streamed payloads. Both server tests and widget stream parsing use this. |
| `codec.ts / encodeSseEvent` | Turns a validated event into a `data: ...` line. |
| `codec.ts / encodeSseFrame` | Adds the `event: <event-type>` line around the data payload. This is what the server writes to the browser. |
| `codec.ts / parseSsePayload` | Parses raw `text/event-stream` chunks into `{ event, data }` payloads without deciding whether the event is valid. |
| `codec.ts / parseKnownSsePayloads` | Parses only known `sidechat.v1` event names into validated stream events. |
| `sequence.ts / validateSidechatEventSequence` | Checks cross-event rules, such as one terminal event and no deltas after completion. |
| `index.ts / protocolVersion` | Package-level export used by consumers that should not import deep protocol paths. |

### Why Effect Schema Here

Effect Schema is useful at the protocol boundary because the same definition gives us:

- runtime decoding of unknown JSON,
- TypeScript DTO types,
- future JSON Schema or Standard Schema adapters,
- a single source of truth for request, response, command, and event shapes.

The OpenAI/AI SDK adapter still uses Zod for AI SDK tool input schemas because AI SDK expects that integration shape today. That does not make Zod the product contract. It is an adapter detail inside `apps/side-chat-api/src/adapters/ai/openai-model.ts`.

## Backend API

The backend is organized as a hexagon.

| Area | What it owns | What it must not own |
| --- | --- | --- |
| `application/` | Use cases and workflow rules. | Hono request objects, OpenAI SDK objects, Postgres client objects, React concepts. |
| `ports/` | Interfaces the use case needs. | Concrete implementations. |
| `adapters/ai/` | AI SDK/OpenAI or fake-model translation into `ModelChunk`. | HTTP routing or widget state. |
| `adapters/workbench/` | Workbench data/report/tool integration. | Protocol stream framing. |
| `inbound/hono/` | HTTP, headers, response codes, SSE streams, dependency composition. | Business workflow decisions beyond adapter-level validation. |

### Main Backend Flow

```txt
POST /chat/stream
  -> chat-stream route checks X-Sidechat-Protocol and JSON body
  -> sse response adapter opens a ReadableStream
  -> streamChat decodes the request with Effect
  -> auth / rate / billing gates run
  -> page context and surface context are resolved
  -> model adapter streams normalized ModelChunk values
  -> streamChat maps chunks to sidechat.v1 events
  -> completed event persists message, citations, attachments, and usage
  -> sse adapter encodes events as text/event-stream frames
```

Important files:

- `application/stream-chat-request-schema.ts`: Effect decode boundary for incoming request bodies.
- `application/effect-boundary.ts`: small helper that marks where Effect errors cross into ordinary async/HTTP code.
- `application/prompt-context.ts`: builds the model-facing prompt context from page and tool data.
- `application/stream-chat.ts`: the central workflow. If you want to know what the assistant actually does, read this file.
- `inbound/hono/routes/chat-stream.ts`: HTTP route adapter. It should stay thin.
- `inbound/hono/response/sse.ts`: converts an async event stream into browser-readable SSE bytes.
- `adapters/ai/openai-model.ts`: AI SDK adapter. This is where provider-specific chunks become our internal `ModelChunk`.
- `adapters/ai/fake-model.ts`: deterministic adapter for tests and safe local runs.
- `adapters/workbench/workbench-tools-adapter.ts`: data/tool adapter for dashboard queries and surface context.
- `inbound/hono/composition/default-deps.ts`: wires concrete adapters into the port interface map.

### Server File And Function Map

#### Inbound Hono Layer

| File / function | Role |
| --- | --- |
| `inbound/hono/app.ts` | Creates the Hono app and registers route groups. |
| `inbound/hono/routes/chat-stream.ts / registerChatStreamRoute` | Owns `POST /chat/stream`: request id, protocol header, JSON parsing, pre-stream validation, and response headers. It should not contain model/tool workflow logic. |
| `inbound/hono/response/protocol-errors.ts / preStreamErrorResponse` | Returns normal JSON errors before streaming begins, for example bad protocol header or invalid request body. |
| `inbound/hono/response/protocol-errors.ts / toProtocolError` | Converts thrown application/domain errors into streamed `sidechat.error` events after streaming has started. |
| `inbound/hono/response/sse.ts / streamEvents` | Creates the `ReadableStream`, runs the application workflow, encodes each `SidechatStreamEvent` with `encodeSseFrame`, and closes the stream. |
| `inbound/hono/composition/default-deps.ts / createDefaultDeps` | Composition root. It chooses fake vs OpenAI model, memory vs Postgres repositories, dashboard tools, report adapter, auth/rate/billing ports, and config. |
| `inbound/hono/composition/model-config.ts` | Defines which models the backend says are supported. |
| `inbound/hono/composition/host-surface-state.ts / createMemoryHostSurfaceState` | Demo server-side memory for host table commands, so later tool calls can reason about the current filtered/sorted table. |

#### Application Layer

| File / function | Role |
| --- | --- |
| `application/stream-chat-request-schema.ts / decodeSidechatRequestEffect` | First application boundary. It turns `unknown` request JSON into `SidechatRequest` or an `InvalidRequest` domain error. |
| `application/effect-boundary.ts / runEffectBoundary` | Bridge between Effect workflows and ordinary promise-based framework code. |
| `application/errors.ts / SideChatDomainError` | Base class for expected use-case failures. These become protocol errors instead of leaking random exceptions. |
| `application/prompt-context.ts / workbenchAssistantSystemPrompt` | System behavior contract for the assistant: scope, data authority, report behavior, citations, and host-command rules. |
| `application/prompt-context.ts / createModelPrompt` | Builds the user-turn prompt from page context, host context, backend surface state, recent conversation, and the latest user message. |
| `application/prompt-context.ts / createModelInput` | Returns `{ system, prompt }` for the model adapter. |
| `application/stream-chat.ts / streamChat` | Public async-generator entry point for the use case. Tests can call this without Hono. |
| `application/stream-chat.ts / streamChatEffect` | Effect-shaped entry point used by the SSE adapter. |
| `application/stream-chat.ts / streamChatWithRequest` | Core workflow after request decoding: model selection, auth/rate/billing gates, conversation setup, page/surface context, model streaming, persistence, usage, and final event. |
| `application/stream-chat.ts / resolveSurfaceContexts` | Loads trusted backend table context for host resources so the model can answer “this table/current view” questions without trusting browser row data. |
| `application/stream-chat.ts / createDeltaEvent` | Maps a normalized model text chunk to `sidechat.delta`. |
| `application/stream-chat.ts / createReasoningEvent` | Maps a normalized reasoning chunk to `sidechat.reasoning`. |
| `application/stream-chat.ts / createToolEvent` | Maps a normalized tool chunk to `sidechat.tool`. |
| `application/stream-chat.ts / createHostCommandEvent` | Maps a validated host command chunk to `sidechat.host_command`. |
| `application/stream-chat.ts / createAssistantMetadata` | Chooses citations and attachments that should be attached to the final assistant message. |
| `application/stream-chat.ts / selectInlineCitationSources` | Keeps citations relevant to the actual answer text instead of dumping every source the tools touched. |

#### Ports Layer

`apps/side-chat-api/src/ports/index.ts` is the backend’s “inside language.” It should be read as a dependency map:

| Port/type | Meaning |
| --- | --- |
| `ModelPort` | Something that can stream normalized `ModelChunk` values. OpenAI and fake adapters both satisfy this. |
| `ModelChunk` | Internal provider-neutral stream shape: text, reasoning, tool, host command, or done. This is not exposed to the browser. |
| `WorkbenchToolsPort` | Approved dashboard data access and current-surface context access. |
| `HostSurfaceStatePort` | Server-side memory of host table commands by workspace/user/conversation/resource. |
| `WorkbenchReportPort` | Generates a controlled report artifact from approved dashboard data. |
| `ConversationRepository` | Persists and reads chat messages. |
| `UsagePort` | Records token usage/cost metadata. |
| `AuthPort`, `RateLimitPort`, `BillingPort` | Product gates before model work begins. |
| `ObservabilityPort` | Lifecycle/counter/span hooks without tying the use case to a telemetry vendor. |
| `ConfigPort` | Supported models and default user id. |

#### AI Adapter Layer

| File / function | Role |
| --- | --- |
| `adapters/ai/openai-model.ts / openAiModelAdapter.stream` | Calls AI SDK `streamText`, passes controlled tools, and translates AI SDK `fullStream` parts into `ModelChunk`. |
| `adapters/ai/openai-model.ts / createWorkbenchTools` | Creates AI SDK tools from backend ports. This is why AI SDK stays behind the adapter. |
| `adapters/ai/openai-model.ts / workbench_query` | Tool for whole-dashboard approved data lookups. It does not accept SQL or arbitrary filters. |
| `adapters/ai/openai-model.ts / workbench_surface_context` | Tool for current visible/filtered/sorted table context. Use this for “on this page/current view/table you just changed” questions. |
| `adapters/ai/openai-model.ts / host_command` | Tool that asks the host UI to filter/sort/focus resources. Its result is validated as `HostCommand` before the app emits `sidechat.host_command`. |
| `adapters/ai/openai-model.ts / generate_workbench_report` | Tool that creates a controlled one-page report through `WorkbenchReportPort`. |
| `adapters/ai/openai-model.ts / toHostCommand` | Converts model tool input into a protocol-owned `HostCommand`, resolving resource and column labels against host context. |
| `adapters/ai/openai-model.ts / toTokenUsage` | Maps AI SDK usage shape into the product `TokenUsage` DTO. |
| `adapters/ai/fake-model.ts / fakeModelAdapter` | Deterministic `ModelPort` implementation for tests and safe local runs. It exercises text, tools, reports, host commands, and usage without provider calls. |

#### Workbench Adapter Layer

| File / function | Role |
| --- | --- |
| `adapters/workbench/workbench-tools-adapter.ts / createWorkbenchTools` | Builds the backend workbench tools port. Uses Postgres-backed dashboard data when `DATABASE_URL` exists, otherwise fallback data. |
| `workbench-tools-adapter.ts / query` | Handles approved whole-dashboard query names and returns data plus citation sources. |
| `workbench-tools-adapter.ts / surfaceContext` | Rebuilds the Portfolio Worklist from approved backend data, applies remembered host view state, and returns the current visible rows. |
| `workbench-tools-adapter.ts / createWorkbenchSources` | Converts dashboard/tool rows into source IDs the UI can cite. |
| `workbench-tools-adapter.ts / createWorklistRows` | Shapes dashboard data into the unified Portfolio Worklist rows used by the demo. |
| `workbench-tools-adapter.ts / applyWorklistView` | Applies host-command filters/sorts to backend-owned rows. |
| `workbench-tools-adapter.ts / createSurfaceContextResult` | Produces the bounded current-view context injected into prompts and tool outputs. |

### Why There Are Two Error Paths

Before streaming starts, the server can still return an ordinary HTTP error:

```txt
bad/missing X-Sidechat-Protocol
  -> preStreamErrorResponse
  -> HTTP 400 JSON
```

After streaming starts, the browser is already reading SSE frames. At that point errors must also be stream events:

```txt
model fails / rate denied / usage capture fails
  -> toProtocolError
  -> sidechat.error
```

That split is important in chat UIs because the frontend needs a terminal stream event to cleanly stop loading state.

### Backend Flow With Ownership

```txt
registerChatStreamRoute
  owns HTTP contract and pre-stream validation
  |
  v
streamEvents
  owns ReadableStream + SSE encoding
  |
  v
decodeSidechatRequestEffect
  owns unknown JSON -> typed request
  |
  v
streamChatWithRequest
  owns product workflow
  |
  +-- config/auth/rate/billing ports
  +-- conversation repository
  +-- page context port
  +-- workbench surface context port
  |
  v
ModelPort.stream
  owns provider/tool execution behind normalized chunks
  |
  v
streamChatWithRequest
  maps chunks -> sidechat.v1 events
  |
  v
streamEvents
  maps events -> SSE frames
```

## Widget Package

The widget is also a hexagon, but the outside world is the browser and host app instead of HTTP/framework/database infrastructure.

| Folder | Role | Example |
| --- | --- | --- |
| `ports/` | Contracts the host app must satisfy. | Transport, identity, host bridge callbacks. |
| `domain/` | Pure widget rules. | Message projection, citations, panel geometry, model aliases, appearance presets. |
| `application/` | Boundary workflows. | Decode streamed frames into known protocol events. |
| `adapters/react/` | Browser and React lifecycle adapter. | Fetch, SSE reading, history loading, host command dispatch, state updates. |
| `ui/` | Presentation slices. | Shell, panel, conversation feed, composer. |
| `shared/ui/` | Vendored visual primitives. | AI Elements-derived components that the package owns locally. |

This is intentionally not a global `hooks/`, `components/`, `utils/` layout. File type is less important than ownership. A hook that manages panel dragging belongs beside the panel shell. A hook that adapts fetch/SSE into chat state belongs in `adapters/react`.

### Main Widget Flow

```txt
User submits message
  -> UI calls useSideChat.sendMessage
  -> adapter reads host context and builds a sidechat.v1 request
  -> fetch POSTs to /chat/stream with X-Sidechat-Protocol
  -> SSE frames are parsed and Effect-decoded
  -> domain projection turns events into WidgetMessage state
  -> host-command events call the host bridge
  -> UI renders text, reasoning, tools, citations, attachments, and command state
```

Important files:

- `index.ts`: public package API. Consumers should import from here, not internals.
- `ports/widget-contracts.ts`: what the host must provide and what the widget promises to call.
- `adapters/react/use-side-chat.ts`: stateful browser adapter around the pure protocol/domain pieces.
- `application/stream-decoding/stream-event-decoder.ts`: Effect decode boundary for streamed JSON frames.
- `domain/message/stream-event-state.ts`: pure event-to-message projection.
- `domain/message/message-presentation.ts`: display policies for citations, attachments, tool names, and context character counts.
- `domain/panel/panel-geometry.ts`: pure panel sizing/dragging constraints.
- `ui/panel-shell/use-panel-shell.ts`: React lifecycle for resize, drag, fullscreen, focus, and close behavior.
- `ui/conversation-feed/RenderedChatMessage.tsx`: message rendering composition.
- `ui/composer/QuickActions.tsx`: predefined demo prompts that paste actual messages into chat.

## Host App And Table Commands

The embedded host app owns the advisory workbench page. The widget can ask the host to apply a view command, but the host decides how to apply it.

That distinction matters:

- The assistant can emit `grid.applyView`.
- The host bridge receives that command.
- The host updates its table state.
- The widget shows whether the command was applied, rejected, unsupported, or failed.

This prevents the reusable widget from importing table implementation details from the host app.

## Why The Comments Are Sparse

Good comments explain ownership, boundary decisions, and surprising behavior. They should not narrate obvious TypeScript syntax.

In this codebase, comments belong mainly at:

- protocol boundaries,
- framework adapters,
- Effect decode boundaries,
- host-command boundaries,
- stream lifecycle logic,
- places where a file exists because of architecture rather than local convenience.

When you add new code, ask: “Would someone learning this architecture understand why this file belongs here?” If not, add a short comment or update this walkthrough.
