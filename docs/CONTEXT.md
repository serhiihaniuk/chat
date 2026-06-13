# Side Chat Durable Context

Last updated: 2026-06-13

This file is the quick orientation layer for architecture, product, widget,
backend, and DB decisions. Deeper rationale lives in `docs/architecture/*`,
`docs/adr/*`, and `docs/ops/*`.

## Product Shape

Side Chat is an embeddable AI harness for ordinary web applications. This repo
owns the protocol, browser client, React widget, host bridge contract, partner AI
core, agent runtime, concrete adapters, database seam, and test harnesses.

The project direction is defined by
`docs/architecture/production-system-design.md`. That document is the target
architecture for the next build phase. The execution plan is
`docs/architecture/implementation-plan.md`.

It does not own a real consuming host application or UBS demo dashboard. External
hosts integrate through:

```txt
external host app -> side-chat-widget -> chat-client -> chat-protocol -> partner-ai-service -> partner-ai-core -> agent-runtime -> adapters
```

The final harness shape is:

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

## Current Repository Shape

- `apps/partner-ai-service`: Hono service, config parsing, HTTP routes, auth,
  adapter composition, transport conversion, and startup.
- `packages/chat-protocol`: `sidechat.v1` DTOs, constants, validators, SSE codec,
  generated JSON Schema, and stream sequence checks.
- `packages/chat-client`: browser-safe typed stream client.
- `packages/host-bridge`: host context/command boundary.
- `packages/partner-ai-core`: framework-free Effect-first product harness:
  policy decisions, turn lifecycle, context management, context manifests, tool
  exposure decisions, workflow orchestration, runtime event mapping, and typed
  application errors.
- `packages/agent-runtime`: AI SDK `ToolLoopAgent` runtime, provider protocol,
  OpenAI adapter, fake provider fixture, Effect-based runtime tool protocol,
  registered tool capability registry, and private AI SDK tool adaptation under
  `runtime/ai-sdk`.
- `packages/db`: Postgres/Drizzle persistence seam and repository adapters.
- `packages/side-chat-widget`: React widget using FSD layers: `widgets`,
  `features`, `entities`, and `shared`; `shared/ui` contains shadcn-style
  primitives and `shared/ai` contains AI Elements-derived components.
- `test-harness/widget-harness`: browser harness for mock-stream and local-service
  widget development.

Use npm workspaces only. Do not reintroduce pnpm.

## Runtime State

The current local service path is OpenAI-configured through `.env`:

- `SIDECHAT_PROVIDER=openai`
- `SIDECHAT_OPENAI_API_KEY`
- `SIDECHAT_ALLOWED_MODELS`, currently including `gpt-5.4-mini`
- `SIDECHAT_OPENAI_REASONING_EFFORT=medium`
- `SIDECHAT_OPENAI_REASONING_SUMMARY=auto`
- `SIDECHAT_AUTH_BEARER_TOKEN=local-compose-token`
- `SIDECHAT_DATABASE_URL` for local Postgres/Drizzle persistence

Fake provider mode remains an explicit deterministic test/development path. It
must not be described as the current real-provider smoke path.

The accepted backend development capability is `mock_web_search`. It is an
`apps/partner-ai-service` adapter that simulates web search without external
egress and is injected into `agent-runtime` through the Effect-based runtime
tool protocol. The model decides whether and when to call it through the AI SDK
tool loop.

Core/server workflow code should be Effect-first. `partner-ai-core` ports expose
`Effect` programs and runtime streams; `agent-runtime` exposes
`streamEffect`; service adapters convert Promise-based HTTP, DB, policy, and
provider libraries into Effect at the edge. Package APIs do not expose
alternate `AsyncIterable` runtime facades; transport adapters convert streams
only at their own boundary, such as SSE response writing.

Effect expected failures use the typed error channel. Known failures should be
created with `Effect.fail`, `Effect.try`, `Effect.tryPromise`, or yielded
failing effects. Raw JavaScript `throw` is a defect. `partner-ai-core` and
`agent-runtime` package boundaries catch defects as a safety net, but
implementation code should not use `throw` for expected business, provider,
persistence, or tool failures.

Context-board construction, redaction, squashing, manifests, and persistence are
product workflow concerns owned by `partner-ai-core` and app-owned adapters. The
agent runtime receives only a prepared `RuntimeContextBoard` and renders it into
model-facing messages.

The target architecture deepens this into a full context manager. It should own
candidate gathering, trust labels, token budgets, history windows, summaries,
compaction, memory injection, retrieval injection, tool-result compression,
rendering, snapshots, and manifests. The widget context meter is not the
authoritative model context budget.

Host apps should eventually register a capability manifest describing tools,
commands, retrieval sources, assistant profiles, workflows, approval policies,
memory policies, and UI activity renderers. Core policy resolves that manifest
per turn or workflow node.

Development tool exposure is non-production behavior. The service may expose
`mock_web_search` in development profile through dev-tool configuration, but
production profile must fail closed on fake providers and development tools.

Multi-agent workflows are target framework behavior, not current runtime
behavior. A workflow must have isolated context per agent node, explicit budgets,
abort propagation, persisted artifacts, handoffs, and audit. Do not model
multi-agent work as a raw tool that simply calls another model.

## Protocol State

`sidechat.v1` is the browser/backend contract. Event type strings are centralized
in `SIDECHAT_EVENT_TYPES`.

Assistant work is represented by a canonical ordered activity stream. The
protocol emits `sidechat.activity` events for progress, safe reasoning summaries,
tool execution, and host-command activity observed from the runtime. Every
activity event has a stable
`activityId`, a monotonic `sequence`, an `activityKind`, a lifecycle `status`,
and display text that is safe for the widget to render.

Tool activity is a `sidechat.activity` item with `activityKind: "tool"` and
contains the tool details needed by the UI:

- `toolCallId`
- `toolName`
- `status`
- optional `input`
- optional `result`
- optional `sources`
- optional `errorCode`

Tool parameters, result, error, and sources stay inside the expandable tool
activity row. They do not create separate top-level timeline rows.

The protocol does not carry request-level tool selection. Tool availability is a
runtime/profile/policy concern, and provider-native tool parts are normalized
before partner AI core maps them to protocol events.

Do not expose provider-native stream parts, AI SDK UI messages, DB rows, or
framework objects through the protocol.

## Widget State

The widget uses FSD layers without app-level cross-imports:

- `widgets/side-chat` exports the public composite widget API.
- `features/chat`, `features/conversation`, `features/panel`, and
  `features/prompt` own user-facing widget capabilities.
- `entities/chat` and `entities/panel` own protocol-backed state and panel
  model types/helpers.
- `shared/ui`, `shared/ai`, and `shared/lib` remain infrastructure only.

The widget includes:

- resizable panel;
- conversation stream;
- canonical assistant activity timeline;
- a single Thinking / Thought for N seconds activity section;
- backend tool rows inside the activity timeline;
- source/citation surfaces;
- suggestions/quick actions from props;
- prompt input;
- context controls;
- model picker inside the prompt input;
- host-command activity display.

Assistant message state stores final assistant text separately from activity
state. Activity state is one ordered model with typed item kinds for reasoning,
progress, tools, and host commands. Completed activity rows keep their order and
main visual presentation after completion; only the current activity item appears
running.

The UI system intentionally keeps accepted dependencies such as `lucide-react`,
`motion`, Streamdown packages, `embla-carousel-react`, `nanoid`, and
`use-stick-to-bottom`. Do not add shadcn registry packages, Radix UI packages,
or generated registry metadata.

## Governance And Verification

Run from the root:

```sh
npm run verify
```

When the shell is not already on the pinned runtime, use:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

The repo currently has no checked-in `.github` workflow. Treat `npm run verify`
as the local/pipeline gate.

Browser e2e runs separately with:

```sh
npm run test:e2e
```

That lane starts the real widget harness and real partner AI service on isolated
test ports, with memory repositories as the mocked DB and the fake provider as
the mocked model.

## Boundaries To Protect

- Hono imports stay under `apps/partner-ai-service/src/inbound`.
- AI SDK/provider runtime imports stay inside `packages/agent-runtime`.
- Runtime DB access stays behind `packages/db` repository adapters.
- `packages/db` must not import Hono, React, widget code, agent runtime, or
  partner AI core use cases.
- `packages/side-chat-widget` must not import service internals, DB code,
  provider SDKs, or agent-runtime internals.
- Product identifiers, protocol event types, route paths, provider/model ids,
  tool names, and env var names should come from constants.
