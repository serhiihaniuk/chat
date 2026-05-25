# Side Chat Durable Context

Last updated: 2026-05-25

This file is the quick orientation layer for architecture, product, widget,
backend, and DB decisions. Deeper rationale lives in `docs/architecture/*`,
`docs/adr/*`, and `docs/ops/*`.

## Product Shape

Side Chat is an embeddable assistant product. This repo owns the protocol,
browser client, React widget, host bridge contract, partner AI core, agent
runtime, concrete service adapters, database boundary, and test harnesses.

It does not own a real consuming host application or UBS demo dashboard. External
hosts integrate through:

```txt
external host app -> side-chat-widget -> chat-client -> chat-protocol -> partner-ai-service -> partner-ai-core -> agent-runtime -> adapters
```

## Current Repository Shape

- `apps/partner-ai-service`: Hono service, config parsing, HTTP routes, auth,
  policy, runtime/persistence composition, and startup.
- `packages/chat-protocol`: `sidechat.v1` DTOs, constants, validators, SSE codec,
  generated JSON Schema, and stream sequence checks.
- `packages/chat-client`: browser-safe typed stream client.
- `packages/host-bridge`: host context/command boundary.
- `packages/partner-ai-core`: framework-free use cases, policies, ports, runtime
  event mapping, and application errors.
- `packages/agent-runtime`: AI SDK `ToolLoopAgent` runtime, provider registry,
  OpenAI adapter, fake provider fixture, tool registry, and backend tools.
- `packages/db`: Postgres/Drizzle persistence boundary and repository adapters.
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

The current backend development tool is `mock_web_search`. It simulates web
search inside `agent-runtime`, emits normalized tool events, streams progress
text, and feeds deterministic search context back to the assistant without
external egress.

## Protocol State

`sidechat.v1` is the browser/backend contract. Event type strings are centralized
in `SIDECHAT_EVENT_TYPES`.

`sidechat.tool` carries backend tool state with:

- `toolCallId`
- `toolName`
- `status`
- optional `input`
- optional `result`
- optional `errorCode`

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
- reasoning display;
- backend tool display;
- source/citation surfaces;
- suggestions/quick actions from props;
- prompt input;
- context controls;
- model picker inside the prompt input;
- host-command display.

The UI system intentionally keeps accepted dependencies such as `ai-elements`,
`lucide-react`, `motion`, Streamdown packages, `cmdk`, `embla-carousel-react`,
`nanoid`, and `use-stick-to-bottom`. Do not add shadcn registry packages, Radix
UI packages, or generated registry metadata.

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
