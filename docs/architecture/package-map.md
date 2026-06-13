# Package Map

Read this when: you need to know which package owns a behavior or type.
Source of truth for: package ownership and public surfaces.
Not source of truth for: domain term definitions or detailed helper flow.

## apps/partner-ai-service

| Field          | Value                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owns           | Deployable service composition, HTTP routes, auth/config adapters, concrete turn guard adapters, SSE conversion, concrete service ports and adapters. |
| Public surface | Service entrypoint and local server.                                                                                                                  |
| May depend on  | Core, runtime providers, db adapters, protocol, Hono.                                                                                                 |
| Must not know  | Product turn lifecycle decisions, widget internal state, or copied UI primitives.                                                                     |
| Main tests     | `apps/partner-ai-service/src/**/*.test.ts`.                                                                                                           |

## packages/chat-protocol

| Field          | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Owns           | `sidechat.v1` request/event DTOs, constants, validation, SSE codec, generated schema. |
| Public surface | Browser/backend protocol types and helpers.                                           |
| May depend on  | Small validation utilities.                                                           |
| Must not know  | React, Hono, Effect, DB rows, AI SDK, provider DTOs.                                  |
| Main tests     | `packages/chat-protocol/src/**/*.test.ts`.                                            |

## packages/chat-client

| Field          | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Owns           | Browser-safe client for consuming protocol streams and resource endpoints.      |
| Public surface | Client factory and stream reader behavior.                                      |
| May depend on  | `chat-protocol`.                                                                |
| Must not know  | Runtime events, provider DTOs, Hono objects, Effect programs, widget internals. |
| Main tests     | `packages/chat-client/src/**/*.test.ts`.                                        |

## packages/host-bridge

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| Owns           | Browser seam for host context and host command dispatch/results. |
| Public surface | Host bridge types and dispatcher.                                |
| May depend on  | `chat-protocol` and `shared` plain TypeScript utilities.         |
| Must not know  | Runtime tools, provider details, DB rows, service internals.     |
| Main tests     | `packages/host-bridge/src/**/*.test.ts`.                         |

## packages/partner-ai-core

| Field          | Value                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owns           | Product stream-chat workflow, manifest/policy validation, turn guard contract/timing, context preparation, turn lifecycle, protocol mapping, ports. |
| Public surface | `streamChatEffect(input)` and `createPartnerAiCoreLayer(...)`.                                                                                      |
| May depend on  | `chat-protocol`, `shared` utilities, Effect.                                                                                                        |
| Must not know  | Hono, Drizzle/Postgres, provider SDKs, React, widget state.                                                                                         |
| Main tests     | `packages/partner-ai-core/src/**/*.test.ts`.                                                                                                        |

## packages/agent-runtime

| Field          | Value                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Owns           | One prepared assistant turn, executable runtime tool registry, profile/provider/model/tool preparation, AI SDK adapter, RuntimeEvent stream. |
| Public surface | `createAgentRuntime`, `streamEffect`, RuntimeEvent/request/error/tool/provider types.                                                        |
| May depend on  | AI SDK, provider SDK packages, Effect.                                                                                                       |
| Must not know  | Product authorization, persistence policy, browser widget state, DB rows, Hono.                                                              |
| Main tests     | `packages/agent-runtime/src/**/*.test.ts`.                                                                                                   |

## packages/db

| Field          | Value                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Owns           | Persistence schema, repository contracts, Postgres/Drizzle adapters, memory repositories for tests. |
| Public surface | Repository interfaces and adapter factories.                                                        |
| May depend on  | `chat-protocol`, `shared` utilities, Drizzle/Postgres, and package-local test helpers.              |
| Must not know  | Hono, React, widget code, agent runtime internals, partner core use cases.                          |
| Main tests     | Repository contract and integration tests under `packages/db/src`.                                  |

## packages/side-chat-widget

| Field          | Value                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Owns           | React widget, FSD layers, protocol-event projection into UI state, prompt and panel behavior. |
| Public surface | Embeddable widget API from `src/index.ts`.                                                    |
| May depend on  | `chat-client`, `chat-protocol`, `host-bridge`, React, accepted UI libraries.                  |
| Must not know  | Effect, DB rows, Hono, provider SDKs, runtime internals.                                      |
| Main tests     | Widget model/component tests and harness E2E tests.                                           |

## packages/shared

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| Owns           | Small cross-package utilities that are truly domain-neutral.  |
| Public surface | Utility exports.                                              |
| May depend on  | Minimal TypeScript-only dependencies.                         |
| Must not know  | Product workflow, provider details, DB, Hono, React UI state. |
| Main tests     | Package-local tests when utilities need behavior coverage.    |

## packages/testing

| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| Owns           | Shared test helpers for repo-owned packages. |
| Public surface | Test-only utilities.                         |
| May depend on  | Test libraries and package contracts.        |
| Must not know  | Production-only composition paths.           |
| Main tests     | Consumers' tests prove behavior.             |

## test-harness/widget-harness

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Owns           | Browser harness for mock-stream and local-service widget development. |
| Public surface | Vite harness app and Playwright scenarios.                            |
| May depend on  | Widget, client, host bridge, local harness helpers.                   |
| Must not know  | Production deployment details.                                        |
| Main tests     | `test-harness/widget-harness/src/**/*.test.ts` and E2E scenarios.     |
