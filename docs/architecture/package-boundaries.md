# Package Boundaries

Read this when: a change crosses packages, protocols, runtime, persistence, or
the widget.
Source of truth for: import/data boundaries and common cross-package mistakes.
Not source of truth for: lifecycle order, package identity, or product
requirements.

## Boundaries

| Boundary            | Owns                                                                                                                                    | May import                                                                                | Must not import                                                              | Common mistake                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Public protocol     | Browser-facing `sidechat.v1` DTOs, constants, validators, sequence checks, SSE codec.                                                   | Validation helpers and domain-neutral primitives.                                         | React, Hono, Effect, DB, AI SDK, runtime internals.                          | Reusing RuntimeEvent or provider shapes as protocol events.                     |
| Chat client         | Browser-safe fetch/SSE reading and protocol decoding.                                                                                   | `chat-protocol` and browser-safe helpers.                                                 | React, Effect, Hono, DB, AI SDK, runtime packages.                           | Moving widget state or protocol definitions into the client.                    |
| AI runtime contract | Provider-neutral `AiRuntimeRequest`, tool scope, RuntimeEvent, error, stream, and port contracts.                                       | `shared`, Effect types.                                                                   | Product core, runtime implementation, Hono, DB, React, AI SDK.               | Adding provider-native options or product policy fields to the shared contract. |
| Runtime             | Prepared assistant turn execution, reusable basic model-only agents, executor registry, runtime tools, provider adapter, RuntimeEvents. | `ai-runtime-contract`, `shared`, Effect, AI SDK/provider packages inside adapter folders. | Product authorization, DB rows, Hono, React, protocol DTOs.                  | Letting runtime decide product policy or expose provider stream parts.          |
| Core workflow       | Authorization, turn policy, context, portable capability contracts, ports, lifecycle, title generation timing/safety, protocol mapping. | `ai-runtime-contract`, `chat-protocol`, `shared`, Effect.                                 | Hono, Drizzle/Postgres, provider SDKs, React, widget state, `agent-runtime`. | Pulling service adapters or DB implementation into core to simplify a use case. |
| Service adapter     | HTTP/Hono, auth/env parsing, concrete ports, app adapters, service composition, title prompt config, SSE transport.                     | Core, runtime providers, DB adapters, protocol, Hono.                                     | Widget internals, copied UI, product lifecycle ownership.                    | Putting tool, title lifecycle, or guard logic directly in routes.               |
| Widget/UI           | React widget, FSD layers, protocol-to-UI projection, host bridge usage.                                                                 | `chat-client`, `chat-protocol`, `host-bridge`, React, UI libraries.                       | Effect, provider DTOs, Hono, DB rows, runtime/service internals.             | Reading runtime activity or service persistence details in UI state.            |
| Host bridge         | Browser seam for host context and host commands.                                                                                        | `chat-protocol` and browser-safe shared utilities.                                        | Runtime tools, DB, service, provider internals, widget internals.            | Treating host commands as backend RuntimeTools by default.                      |
| Persistence         | Schema, repository contracts, Drizzle/Postgres adapters, in-memory repositories.                                                        | `shared`, Drizzle/Postgres, package-local test helpers.                                   | Hono, React, widget, runtime internals, core use cases.                      | Importing protocol DTOs only to get generic JSON shapes.                        |
| Shared primitives   | Truly domain-neutral helpers.                                                                                                           | Minimal TypeScript-only dependencies.                                                     | Product workflow, provider details, DB, Hono, React UI state.                | Turning `shared` into a dumping ground for Side Chat concepts.                  |

## Data Rules

- Hono objects become `StreamChatInput` at the HTTP adapter boundary.
- Core turns policy instructions, trusted context, and chat history into final
  `AiRuntimeRequest.messages` before crossing the runtime port.
- AI SDK stream parts become provider-neutral RuntimeEvents inside
  `agent-runtime`; the event shape lives in `ai-runtime-contract`.
- RuntimeEvents become browser-safe SidechatStreamEvents in `partner-ai-core`.
- Drizzle/Postgres records stay behind repository adapters.
- Widget message and activity state is derived only from protocol events and
  host-bridge messages.

## Import Checks

- `scripts/check-boundaries.mjs`
- `scripts/check-runtime-boundaries.mjs`
- `scripts/check-widget-layers.mjs`
- `scripts/check-package-exports.mjs`
- `scripts/check-human-readability.mjs`
