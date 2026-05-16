# Workbench Side-Chat Assistant - System Design

## 1. Overview

This system is a production-shaped foundation for an AI assistant embedded inside a Workbench-style product UI.

The demo host is a UBS Partner advisory workbench. The assistant appears as a side-chat widget inside that host, receives page context from the host, streams responses from the backend, can emit citations and tool states, and can ask the host to apply serializable UI commands such as focusing a resource or filtering a grid.

The architectural point is deliberate:

> A product chat assistant needs a stable UI-facing chat protocol. The model provider is only one adapter behind that protocol.

That is why this repo uses Node.js/TypeScript for the browser-facing boundary, `sidechat.v1` for the shared protocol, AI SDK for provider streaming inside an adapter, Effect where typed workflow boundaries help, and Postgres behind stored-procedure-backed data access.

## 2. Goals

| Goal | Meaning in this repo |
| --- | --- |
| Reusable side-chat UI | `packages/side-chat-widget` can be consumed by a host app without importing host internals. |
| Typed chat protocol | `packages/shared-protocol` owns `sidechat.v1` request, event, Effect schema, codec, and sequence rules. |
| UI-facing TypeScript backend | `apps/side-chat-api` owns the browser-facing streaming API. |
| Provider isolation | AI SDK and OpenAI details stay in `apps/side-chat-api/src/adapters/ai`. |
| Host ownership | The embedded host owns its dashboard state and exposes only context/commands through a bridge. |
| DB isolation | `packages/db` owns Postgres access through stored procedures/functions. |
| Teachable architecture | The folder layout, docs, tests, and governance checks should make the boundary rules visible. |

## 3. Requirements

### 3.1 Product Requirements

| # | Requirement | Acceptance Criteria |
| --- | --- | --- |
| P1 | Embedded assistant | The host app renders the side-chat widget on the Workbench page. |
| P2 | Streaming responses | The widget consumes server-sent `sidechat.v1` events from `/chat/stream`. |
| P3 | Reasoning/status display | The protocol and widget support `sidechat.reasoning` events. |
| P4 | Tool-call display | The protocol and widget support `sidechat.tool` events with running/completed/error states. |
| P5 | Citations/sources | Tool and message metadata can carry citation references from approved Workbench data. |
| P6 | Host commands | The assistant can emit serializable commands such as `grid.applyView` and `ui.focusResource`. |
| P7 | Dashboard demo data | The host reads advisory dashboard data through `apps/dashboard-data-api`. |
| P8 | One fixed demo conversation | `demo-conversation-001` is intentionally used for the current demo. |

### 3.2 Architecture Requirements

| # | Requirement | Acceptance Criteria |
| --- | --- | --- |
| A1 | Stable product protocol | The browser consumes `sidechat.v1`, not AI SDK or provider-native stream types. |
| A2 | Hexagonal boundary | Hono, AI SDK, Postgres, reports, and host context are adapters around application use cases. |
| A3 | Modular monolith | Modules remain in one workspace until service extraction has a real operational reason. |
| A4 | AI SDK adapter ownership | AI SDK imports stay in the side-chat API AI adapter boundary. |
| A5 | Stored-procedure DB boundary | Runtime database access goes through `packages/db` functions/procedures. |
| A6 | Reusable widget package | The host consumes `@side-chat/side-chat-widget`; it does not import widget internals. |
| A7 | Effect only where useful | Effect is used for typed schemas, boundaries, errors, dependencies, and workflows, not every helper. |

### 3.3 Verification Requirements

| # | Requirement | Acceptance Criteria |
| --- | --- | --- |
| V1 | Governance checks | `npm run lint` passes. |
| V2 | Type safety | `npm run typecheck` passes for implementation changes. |
| V3 | Unit/integration tests | `npm test` passes for implementation changes. |
| V4 | Browser integration | `npm run test:e2e` covers the embedded host path when UI behavior changes. |
| V5 | Docs accuracy | README commands match workspace scripts, Compose config, and current app wiring. |

## 4. Architecture Style

The target architecture is:

```txt
modular monolith + vertical slices + lightweight hexagonal ports/adapters
```

Each term matters.

### 4.1 Modular Monolith

A modular monolith means the system is deployed and developed as one repo/workspace, but the internal modules have explicit boundaries.

This is a better fit than early microservices because the system is still proving its product protocol, data boundaries, and assistant flows. Splitting services too early would add network, deployment, and versioning complexity before the internal contracts are stable.

In this repo, the modules are:

- chat API
- dashboard data API
- embedded host app
- widget package
- shared protocol package
- DB package

They are separate enough to teach boundaries, but close enough to refactor safely.

### 4.2 Vertical Slices

A vertical slice groups code around a user-facing capability instead of around technical layers only.

Example: "stream a Workbench chat response" crosses HTTP, application logic, model streaming, tool context, persistence, and protocol events. The code should make that workflow understandable as one product behavior.

The app should still use layers, but the layers should serve the capability, not hide it.

### 4.3 Hexagonal Architecture

Hexagonal architecture is the inside/outside rule:

```txt
inside: application use cases and domain workflow
outside: frameworks, HTTP, databases, model providers, browser UI, file systems
```

The inside defines what it needs through ports. The outside satisfies those ports through adapters.

For this repo:

| Inside concept | Outside adapter |
| --- | --- |
| Stream a chat response | Hono route calls the use case |
| Generate model chunks | AI SDK/OpenAI adapter implements `ModelPort` |
| Store conversations | memory or Postgres repository adapter |
| Read Workbench context | Workbench tools adapter |
| Generate reports | Playwright report adapter |
| Authorize/rate/bill | current placeholder adapters, future real adapters |

The main learning point: Hono is not the architecture. AI SDK is not the architecture. Postgres is not the architecture. They are adapters around the product workflow.

## 5. System Diagram

```txt
Embedded Workbench Host
  |
  | renders
  v
@side-chat/side-chat-widget
  |
  | POST /chat/stream
  | X-Sidechat-Protocol: sidechat.v1
  v
@side-chat/shared-protocol
  |
  v
apps/side-chat-api
  |
  +- inbound/hono
  |    translates HTTP/SSE
  |
  +- application/stream-chat
  |    owns the chat workflow
  |
  +- ports
  |    ModelPort, WorkbenchToolsPort, repositories, usage, reports
  |
  +- adapters/ai
  |    AI SDK/OpenAI or fake model
  |
  +- adapters/workbench
  |    approved Workbench tool context
  |
  +- adapters/reports
       report generation

Host dashboard data path:

Embedded Workbench Host
  -> apps/dashboard-data-api
    -> packages/db
      -> Postgres stored procedures/functions
```

## 6. Project Structure

```txt
apps/
  side-chat-api/
    src/
      inbound/hono/          HTTP/SSE adapter and composition boundary
      application/           chat use case, Effect boundary, request decoding
      ports/                 interfaces the application depends on
      adapters/ai/           AI SDK/OpenAI and fake model adapters
      adapters/workbench/    Workbench tool-context adapter
      adapters/reports/      report generation adapter
  dashboard-data-api/
    src/                     read-only Hono API over advisory dashboard data
  embedded-host-app/
    src/
      features/advisory-workbench/
                              UBS Partner demo page, dashboard state, host bridge
      shared/host-surface/    bridge between host page and side-chat widget
  widget-demo/
    src/                     isolated widget playground
packages/
  shared-protocol/
    src/sidechat.v1/         Effect schemas, DTOs, headers, SSE codec, sequence rules
  side-chat-widget/
    src/
      domain/                widget rules: message presentation, panel geometry, appearance
      application/           UI workflows such as Effect stream decoding
      hooks/                 browser transport and host bridge adapters
      ui/                    focused React components and vendored AI Elements pieces
      SideChatWidget.tsx     public shell and composition
  db/
    src/                     Postgres function/procedure access
docker/postgres/init/
  001_schema.sql             schema, grants, functions/procedures
  002_seed.sql               deterministic demo data
```

This tree is intentionally brownfield-real. It describes the codebase as it exists, not a perfect future folder diagram.

## 7. Bounded Contexts

| Context | Owns | Does not own |
| --- | --- | --- |
| Conversation | messages, conversation id, stream lifecycle, history, usage recording trigger | Hono details, provider-native stream parts, widget rendering |
| AI Gateway | model selection, provider normalization, provider tool-call mapping | dashboard UI state, DB schema ownership |
| Workbench Context | approved dashboard context, citations, host command shape | arbitrary SQL, browser-only state mutation |
| Widget | reusable chat shell, event rendering, host bridge API | AG Grid internals, Postgres, provider SDK runtime |
| Dashboard Data | read-only dashboard records for the host app | chat streaming and model orchestration |
| DB | stored-procedure-backed Postgres access | Hono, React, AI SDK, widget code, use cases |

Bounded contexts are not automatically services. Here they are boundaries inside a monorepo.

## 8. Chat Stream Flow

```txt
User sends a prompt in the side-chat widget
  |
  +- widget asks host for current page context
  |
  +- widget builds SidechatRequest
  |    workspaceId
  |    conversationId
  |    message
  |    model
  |    hostContext
  |
  +- widget POSTs /chat/stream
  |    X-Sidechat-Protocol: sidechat.v1
  |    Accept: text/event-stream
  |
  +- Hono route validates HTTP/protocol boundary
  |
  +- Effect boundary decodes the request body into application input
  |
  +- streamChat use case
  |    authorize workspace
  |    check rate/billing ports
  |    load context/history
  |    append user message
  |    call ModelPort.stream()
  |
  +- AI SDK adapter maps provider stream parts into internal model chunks
  |
  +- application maps chunks into sidechat.v1 events
  |
  +- server emits SSE events
  |
  +- widget updates message state
  |
  +- host executes supported host commands
```

The server can emit these protocol events:

| Event | Meaning |
| --- | --- |
| `sidechat.started` | Stream accepted and assistant message started. |
| `sidechat.reasoning` | Reasoning/status content for UI display. |
| `sidechat.delta` | Assistant text token/content delta. |
| `sidechat.tool` | Tool call state, input, output, or error. |
| `sidechat.host_command` | Serializable command the host may apply. |
| `sidechat.completed` | Successful terminal event with usage metadata. |
| `sidechat.error` | Error event. Terminal when emitted as the stream outcome. |
| `sidechat.history` | History payload for conversation hydration. |

Exactly one terminal event should end a stream: `sidechat.completed` or terminal `sidechat.error`.

## 9. Dashboard Data Flow

```txt
Embedded Workbench Host
  |
  +- fetch /advisory-dashboard/snapshot
  +- fetch /advisory-dashboard/clients
  +- fetch /advisory-dashboard/risk-accounts
  +- fetch /advisory-dashboard/product-allocation
  +- fetch /advisory-dashboard/net-new-money-trend
  |
  v
apps/dashboard-data-api
  |
  v
packages/db
  |
  v
Postgres functions/procedures
```

The dashboard data API is deliberately separate from the chat stream API. The host dashboard should not need to know anything about model providers, chat streams, or assistant orchestration.

The chat API may also need approved dashboard data for tools. Today it reaches that data through an explicit `WorkbenchToolsPort` adapter. That is an acceptable monorepo transition state, but the coupling is named and contained.

## 10. Shared Protocol Strategy

`packages/shared-protocol` is the product contract.

It owns:

- protocol version: `sidechat.v1`
- request headers
- request DTOs
- stream event DTOs
- Effect schemas as the canonical runtime contract
- derived TypeScript types
- validation and parse helpers
- SSE codec helpers
- sequence validation
- protocol fixtures for tests

The ownership rule is:

```txt
Effect Schema owns the protocol.
Adapters may translate the protocol for a library boundary.
```

For example, the AI SDK adapter may still use Zod for provider tool input because AI SDK accepts Zod-style tool schemas. That does not make Zod the product contract. It is only an adapter shape at the provider boundary.

This package is important because it prevents provider leakage.

Bad boundary:

```txt
Widget consumes OpenAI/AI SDK stream parts directly
```

Good boundary:

```txt
Provider stream parts -> server adapter normalization -> sidechat.v1 events -> widget
```

That makes the browser contract stable even if the provider adapter changes later.

## 11. AI SDK Role

AI SDK is used for provider integration, not for the whole app architecture.

It belongs in:

```txt
apps/side-chat-api/src/adapters/ai
```

That adapter can own:

- `streamText`
- provider client setup
- provider options
- provider tool definitions
- provider stream part mapping
- provider usage mapping
- OpenAI-specific behavior

The application use case should own:

- whether a request is allowed
- what conversation is being answered
- which ports are called
- what product events mean
- how errors become `sidechat.v1`
- which host capabilities are exposed

This separation is the reason the product protocol can survive provider changes.

## 12. Effect TS Role

A plain Promise tells you:

```txt
Promise<T>
```

Meaning:

```txt
eventually T, or maybe an unknown thrown failure
```

Effect tells you more:

```txt
Effect<Success, Error, Requirements>
```

Meaning:

```txt
this can succeed with Success,
can fail with Error,
and needs Requirements from the environment
```

That extra information is useful for a chat backend because many failures are expected product states:

- invalid request
- unauthorized workspace
- rate limited
- billing disabled
- model unavailable
- tool input invalid
- context unavailable
- stream aborted

In this repo, Effect is currently used narrowly:

- shared `sidechat.v1` protocol schemas
- request decoding at the application boundary
- an explicit boundary runner around the Hono/SSE path
- a frontend stream-frame decoding workflow in the widget

Target use:

- typed expected errors
- service requirements for ports/dependencies
- resource lifetime around streams, DB clients, report generation, and cancellation
- workflows where each step has success, failure, and dependency meaning

Non-target use:

- formatting helpers
- constants
- simple sorting/filtering
- deterministic pure transforms
- adding Effect just to make code look more advanced

## 13. Hexagonal Ports And Adapters

The most practical way to understand hexagonal architecture here:

```txt
Application core should be testable without Hono, OpenAI, Postgres, or React.
```

That means the core talks to interfaces:

```txt
streamChat(deps, request)
```

Where `deps` includes ports such as:

- model streaming
- conversations
- usage
- page context
- Workbench tools
- Workbench reports
- auth
- rate limit
- billing
- observability
- config

Adapters provide real implementations:

- Hono receives HTTP and calls the use case.
- AI SDK implements model streaming.
- Postgres implements conversation/usage persistence when `DATABASE_URL` is present.
- In-memory repositories keep tests and local deterministic paths simple.
- Workbench adapters expose approved host context and commands.

The result: tests can drive the application core through fake ports, while production/dev can wire real adapters at the edge.

## 14. Widget And Host Boundary

The widget is a reusable package:

```txt
packages/side-chat-widget
```

It should own:

- chat shell rendering
- composer behavior
- stream event consumption
- message/reasoning/tool/citation rendering
- host bridge request/response shape
- package CSS needed by consumers

It should not own:

- AG Grid internals
- host dashboard state
- Postgres access
- provider SDK runtime
- application routes

The host app owns the Workbench:

```txt
apps/embedded-host-app
```

It provides:

- page context snapshots
- resource metadata
- supported host capabilities
- command application logic
- dashboard layout/state

The bridge between them is intentionally serializable. That keeps the widget package reusable and prevents host-specific logic from creeping into it.

Internally, the widget is now shaped like a frontend hexagon:

```txt
SideChatWidget.tsx
  -> ui/             focused React components
  -> hooks/          browser transport and host bridge adapters
  -> application/    UI workflows such as Effect stream decoding
  -> domain/         message presentation, panel geometry, appearance, model aliases
```

The main learning point: React renders; the protocol validates; application workflows coordinate boundaries; domain modules hold reusable rules.

## 15. Postgres Boundary

`packages/db` is the only runtime package that should own `pg` access.

Runtime code should not directly read/write application tables from random modules. Instead, it should call stored procedures/functions exposed through the DB package.

Why this matters:

- grants can be narrower
- SQL behavior is easier to audit
- application code stays testable through ports
- browser code cannot accidentally grow a database dependency
- future service extraction has a clearer boundary

Governance checks enforce the important parts:

- `pg` imports stay in `packages/db` and explicit harnesses
- `packages/db` does not import Hono, React, AI SDK, widget code, or use cases
- required stored procedures/functions exist
- direct table grants are revoked where required

## 16. Runtime Modes

| Mode | Purpose |
| --- | --- |
| Full Postgres demo | Realistic local demo with Postgres-backed chat/dashboard data and real provider requests when configured. |
| Deterministic fake model | Local/dev/test mode with stable assistant output and no provider credentials. |
| Widget demo | Isolated package surface for widget inspection. |
| Playwright e2e | Automated integrated browser path for the embedded host app. |
| Docker API smoke | Containerized Postgres plus side-chat API startup check. |

Real provider mode requires:

```sh
SIDE_CHAT_MODEL_ADAPTER=openai
OPENAI_API_KEY=...
USE_FAKE_MODEL=false
```

Deterministic mode uses:

```sh
USE_FAKE_MODEL=true
```

## 17. Testing Strategy

The test strategy follows the architecture boundaries.

```txt
Protocol tests
  -> prove sidechat.v1 event shapes and sequence rules

Application tests
  -> drive streamChat through fake ports

Adapter tests
  -> prove AI, Workbench, reports, DB adapters map boundaries correctly

Widget tests
  -> prove stream events render without provider SDK runtime

DB tests
  -> prove stored-procedure access and grants

E2E tests
  -> prove the embedded host path works in the browser
```

Representative files:

| Area | Examples |
| --- | --- |
| Protocol | `packages/shared-protocol/tests/sidechat-protocol.test.ts` |
| Chat API | `apps/side-chat-api/test/stream-chat.test.ts`, `api.test.ts`, `openai-model.test.ts` |
| Widget | `packages/side-chat-widget/src/test/stream-events.test.ts`, `message-parts.test.ts`, `host-bridge.test.ts` |
| DB | `packages/db/tests/db-protocol.test.ts`, `packages/db/test/schema-security.test.ts` |
| E2E | `apps/embedded-host-app/tests/embedded-host.spec.ts` |

Final broad gate:

```sh
npm run verify
```

Release-grade local evidence can add:

```sh
npm run build
npm run test:e2e
```

## 18. Governance

`npm run lint` executes repository governance checks.

It protects:

- exact dependency pins
- naming constraints
- Hono import boundary
- AI SDK import boundary
- `pg` import boundary
- shared protocol framework independence
- DB package isolation
- vendored AI Elements packaging constraints
- stored-procedure requirements

The repo also has a report-only quality inventory:

```sh
npm run quality:inventory
```

That inventory is a review prompt, not a design law. It helps identify files with too much nesting, long functions, nested ternaries, and other complexity smells during cleanup work.

## 19. Known Transition States

These are known and intentionally documented:

- The Workbench tools adapter in the chat API can access the same advisory data used by the host dashboard. It is explicit and isolated, but still a transition state to revisit if service boundaries harden.
- Effect is not yet the full dependency/layer model for the chat use case. Current usage is narrow and educational.
- The model picker is a demo affordance unless it is explicitly turned into real provider selection.
- The app intentionally uses one demo conversation for now.
- Authentication, rate limiting, and billing exist as ports/placeholders, not finished production integrations.
- Real provider calls are not deterministic verification and require explicit environment configuration.

## 20. Extension Path

Good next architectural steps:

1. Expand Effect around typed application errors and dependency services where it clarifies the stream workflow.
2. Harden cancellation and retry semantics in the product protocol.
3. Decide whether Workbench tool context should continue using `packages/db` directly or call a separate data service boundary.
4. Add real auth, rate limiting, and billing adapters.
5. Add real model/provider switching only if the product needs it.
6. Put a Python/LangGraph or RAG service behind the Node chat boundary only when complex agent workflows justify it.

Bad next steps:

- splitting into microservices just to look enterprise
- adding DDD ceremony that does not clarify behavior
- exposing provider stream types to the widget
- connecting browser code directly to Postgres
- making every helper an Effect program
- hardening npm publishing before monorepo consumption becomes a real constraint

## 21. Non-Goals

| Non-goal | Reason |
| --- | --- |
| Microservices now | The product protocol and module boundaries should stabilize first. |
| Pure DDD ceremony | The app needs clear boundaries, not abstract ceremony. |
| Direct provider protocol in the browser | The browser contract must remain `sidechat.v1`. |
| Direct browser-to-database access | The dashboard and assistant must use API/DB package boundaries. |
| Full provider-management product | The current model picker is a demo affordance. |
| npm package publishing hardening | Monorepo consumption is assumed for now. |

## 22. Mental Model

When deciding where code belongs, ask:

1. Is this product chat protocol? Put it in `packages/shared-protocol`.
2. Is this reusable chat UI? Put it in `packages/side-chat-widget`.
3. Is this host dashboard behavior? Put it in `apps/embedded-host-app`.
4. Is this HTTP/SSE translation? Put it in the Hono inbound adapter.
5. Is this application workflow? Put it in `apps/side-chat-api/src/application`.
6. Is this provider-specific model streaming? Put it in `apps/side-chat-api/src/adapters/ai`.
7. Is this Postgres access? Put it in `packages/db`.
8. Is this a dependency the application should not know concretely? Model it as a port.

That is the practical architecture rule for this codebase.
