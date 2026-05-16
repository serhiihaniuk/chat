# Current Architecture

Status: current code

This document describes what the repository does today. It is intentionally a brownfield map, not a claim that every boundary is already ideal.

The most important rule for reading this file is simple: current code is evidence. The canonical system design lives in [../../SYSTEM-DESIGN.md](../../SYSTEM-DESIGN.md), the compact target summary lives in [target.md](./target.md), and the migration path lives in [transition-roadmap.md](./transition-roadmap.md).

## System Shape

The repository is an npm workspace for a reusable side-chat assistant embedded in a realistic Workbench-style host app.

```txt
apps/embedded-host-app
  -> consumes packages/side-chat-widget
  -> fetches dashboard data from apps/dashboard-data-api

packages/side-chat-widget
  -> sends sidechat.v1 requests
  -> consumes sidechat.v1 SSE events
  -> asks the host for page context and dispatches host commands

apps/side-chat-api
  -> exposes chat route modules through Hono
  -> runs the streamChat use case
  -> adapts AI SDK provider streams into sidechat.v1 events
  -> builds Workbench tool data access through an explicit adapter

apps/dashboard-data-api
  -> exposes read-only dashboard data routes
  -> uses packages/db advisory dashboard functions
  -> can run a fixture-backed reader for local e2e only

packages/shared-protocol
  -> owns sidechat.v1 Effect schemas, derived DTO types, SSE codec, and sequence rules

packages/db
  -> owns Postgres access
  -> runtime access goes through stored procedures/functions
```

## What Is Already Strong

The product chat boundary is already real. `packages/shared-protocol/src/sidechat.v1/*` defines the request shape, headers, stream events, host commands, token usage, codecs, and sequence validation. Effect Schema is now the canonical source of truth, with TypeScript types derived from it and validation helpers used by the API and widget. The widget hook consumes that contract instead of consuming provider SDK objects directly.

The AI SDK dependency is also mostly in the right place. `apps/side-chat-api/src/adapters/ai/openai-model.ts` imports `ai` and `@ai-sdk/openai`, calls `streamText`, maps `fullStream` parts, and yields internal `ModelChunk` values through `ModelPort`.

The DB boundary has a clear direction. `packages/db` owns Postgres access, and repository governance checks that `pg` imports stay in the DB package and explicit harnesses.

The host app consumes the widget package rather than reaching into widget internals. That matters because the widget is meant to become reusable in a real work setting.

The side-chat API now uses package-local layer aliases for cross-layer imports: `#application`, `#ports`, `#adapters`, and `#inbound`. These aliases make the hexagonal boundary visible in source and tests, while same-layer implementation neighbors can still use relative imports.

## Brownfield Inventory

| Resource | Current | Target | Why it matters | Risk |
| --- | --- | --- | --- | --- |
| `apps/side-chat-api/src/inbound/hono/index.ts` and `apps/side-chat-api/src/inbound/hono/routes/*` | `index.ts` is now a thin re-export, while Hono behavior is split into health/models, chat stream, history/usage, and reports route modules. | Keep Hono as the inbound HTTP adapter and keep future route behavior in focused modules. | Hono should translate HTTP into use case calls; it should not quietly become the application architecture. | Future route additions could drift back into mixed composition if the route/composition boundary is not protected. |
| `apps/side-chat-api/src/application/stream-chat.ts` and `stream-chat-request-schema.ts` | The Effect entrypoint delegates request decoding to shared protocol validation, then the main use case checks model/auth/rate/billing, loads context/history, appends messages, streams model chunks, emits sidechat events, records usage, and enriches citations/attachments. | A clearer application workflow, still centered on ports, with Effect services/layers added only where they clarify dependencies and lifecycle. | This is the best place to teach the application core: it knows the conversation, not Hono, React, Postgres, or provider SDK details. | Async generator complexity can hide lifecycle and error rules. |
| `apps/side-chat-api/src/adapters/ai/openai-model.ts` | The AI SDK adapter owns `streamText`, strict Zod tool inputs, `stopWhen`, `fullStream`, reasoning deltas, tool results, host commands, and report generation tool wiring. Host command outputs are decoded through shared protocol helpers after the adapter-local Zod envelope is parsed. | Adapter-only ownership of provider streaming and provider tool calls, with business policy pushed toward application-owned ports/services where practical. | AI SDK is excellent for provider integration and stream/tool mechanics, but it should not become the application core. | Tool policy can accumulate in provider code and become hard to test without provider behavior. |
| `apps/side-chat-api/src/adapters/workbench/workbench-tools-adapter.ts` | Workbench data lookup, fallback data, current surface context, citations, and host view filtering now live behind `WorkbenchToolsPort`. | Keep Workbench tool policy outside Hono and continue splitting citation/surface helpers if the adapter grows. | Assistant tools need approved Workbench data, but Hono should not own dashboard query policy. | The adapter is still large and should be watched for smaller helper extraction. |
| `packages/shared-protocol/src/sidechat.v1/*` | Shared Effect schemas, derived types, headers, routes, SSE codec, and sequence validation. | Stable UI-facing product protocol that can survive provider changes. | This is the strongest evidence for the Node/TypeScript chat boundary argument. | Confusing AI SDK UI message types with the product protocol would make provider details leak into the product contract. |
| `packages/side-chat-widget/src/*` | The reusable widget now has `domain`, `application`, `hooks`, and `ui` slices. `use-side-chat.ts` posts chat requests, reads SSE frames, handles history/usage, asks for host context, and dispatches host commands. | A reusable frontend hexagon consuming only shared protocol plus explicit host bridge APIs. | This is what makes the widget usable inside a Workbench host without importing host internals. | Host-specific behavior can drift into the package and reduce reuse. |
| `packages/db/src/*` | Stored-procedure-backed data access for side chat and advisory dashboard records. | Infrastructure adapter only: no Hono, React, AI SDK, widget, or application use case imports. | DB access should be replaceable/testable from the application perspective. | Direct table SQL or cross-layer imports would break the stored-procedure boundary. |
| `apps/dashboard-data-api/src/*` | A separate Hono dashboard data service over an `AdvisoryDashboardReader` port, backed by Postgres in normal runtime and by deterministic fixture data in local e2e. | The intended dashboard data API for host/dashboard reads. | The dashboard data problem and chat streaming problem are separate concerns unless deliberately connected. | The chat API still constructs its own Workbench tool adapter for AI context; that coupling is now explicit but can be refined further. |

## Current Chat Flow

```txt
Widget composer
  -> useSideChat()
  -> POST /chat/stream with X-Sidechat-Protocol: sidechat.v1
  -> Hono chat stream route module
  -> streamChat()
  -> ModelPort.stream()
  -> openAiModelAdapter / fakeModelAdapter
  -> sidechat.started / reasoning / delta / tool / host_command / completed
  -> widget message state
  -> host bridge command dispatch when needed
```

The key architectural fact: the browser does not need to know how `streamText` works. It knows `sidechat.v1`.

## Current Transitional Coupling

`apps/dashboard-data-api` is the intended read-only dashboard data service for the host application. At the same time, `apps/side-chat-api` currently constructs a Workbench tool adapter that can use advisory dashboard DB access for AI tool context.

That is acceptable as current demo code, but it is a transition state. The docs and future refactors should name it clearly:

- Host dashboard reads go through `apps/dashboard-data-api`.
- AI tool context currently reaches the same DB package through `WorkbenchToolsPort` adapter construction.
- The target is to keep that adapter explicit and, if needed, later decide whether it should call a separate dashboard data service or continue using `packages/db` directly inside the monorepo.

## Current Verification Picture

Expected broad gates for implementation changes:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`

For docs-only changes, `npm run lint` is the relevant automated check because this repo uses it for governance and naming boundaries.
