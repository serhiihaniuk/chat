# Package boundaries

Read this when: adding imports, moving code, or deciding where a contract belongs.

Source of truth for: dependency direction and representation changes between current packages.

## Dependency table

| Owner                       | May depend on                                                                                                          | Must not absorb                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/side-chat-service`    | `db`, `stream-profile`, `shared`, Hono, AI SDK/provider adapters, Workflow DevKit, Postgres World                      | React rendering, widget state, host-page behavior                        |
| `packages/side-chat-server` | `shared`                                                                                                               | HTTP frameworks, providers, Workflow, PostgreSQL, React, process startup |
| `packages/db`               | `shared`, Drizzle, `pg`                                                                                                | HTTP, providers, Workflow orchestration, browser DTOs, product policy    |
| `packages/stream-profile`   | TypeScript primitives only                                                                                             | React, HTTP frameworks, providers, Workflow, database code               |
| `packages/side-chat-widget` | `host-bridge`, `stream-profile`, `shared`, React, browser-safe AI SDK/Workflow transport, TanStack Query, UI libraries | Hono, PostgreSQL, provider SDKs, service internals, Workflow server APIs |
| `packages/host-bridge`      | `shared`                                                                                                               | React, Hono, providers, Workflow, database code, widget internals        |
| `packages/shared`           | TypeScript primitives only                                                                                             | Product, framework, provider, Workflow, or persistence policy            |
| `apps/docs`                 | `side-chat-widget`, React, local Vite tooling                                                                          | Service internals, HTTP calls, providers, Workflow, or database access   |

`apps/docs` may import the widget's public package exports and exported stylesheet.
It must not reach into widget source through relative paths. The docs app treats CSS
token values as local preview input and never promotes them to runtime configuration.

## Service dependency law

Inside `apps/side-chat-service`, dependencies point toward application/domain ownership:

- `sidechat.ts`, `auth`, and `integrations` form the visible adopter surface and depend on public `@side-chat/side-chat-server` contracts.
- `domain` imports no application, adapter, composition, config, Workflow, or test modules.
- `application` imports domain and application-owned ports, never adapters or composition.
- `adapters` implement application ports and translate external representations.
- `composition` selects concrete adapters and owns resource lifetime.
- `workflows` own Workflow directives and durable mechanics; HTTP and application modules do not import Workflow server APIs directly.
- production composition never imports scripted models or testing-only Workflow entries.

Use `#application/*`, `#adapters/*`, `#composition/*`, `#config/*`, `#domain/*`, and `#workflows/*` subpaths. Do not reach across service source folders with long relative imports.

## Representation boundaries

Representations change once at the boundary that owns the conversion:

- Untrusted HTTP JSON becomes application input in `adapters/http`.
- Browser host context becomes bounded domain reference data at the request schema.
- The raw client-tool capability becomes a digest at the HTTP edge; the raw value never enters Workflow or PostgreSQL.
- Provider configuration becomes an AI SDK model inside the Workflow step realm; credentials and provider closures are never journaled.
- Raw Workflow model parts become public `UIMessageChunk` values at the Workflow/HTTP stream edge.
- The scrub transform narrows errors and metadata once before SSE encoding.
- Product repository records become application/domain projections in service persistence adapters.
- Native `UIMessage` values become widget-owned visible message and activity state in the widget session reducer.

## Infrastructure ownership

- `process.env` is read only by the service configuration/environment boundary and process boot code.
- `pg` and `drizzle-orm` stay in `packages/db`.
- Hono stays in service HTTP/composition code.
- Provider SDKs stay in service provider adapters and their Workflow-realm reconstruction path.
- Server-side `workflow` APIs stay in `src/workflows` and `src/composition/workflow`.
- Browser-safe `@ai-sdk/workflow` transport and `ai` stream helpers stay in the widget's `workflow-chat` slices.

## Public browser contracts

There is no repository-owned custom chat event protocol. The chat wire is AI SDK UI message stream `v1`, profiled by `@side-chat/stream-profile`. The only separate SSE vocabulary is the small subject activity feed owned by the service and validated by the widget.

Public widget customization receives widget-owned types such as `SideChatActivityItem`; it must not expose AI SDK provider parts, Workflow records, database rows, or service errors.

## Enforcement

Run `npm run lint:custom` after boundary changes. The custom gates check service architecture, Workflow directive placement, production/testing isolation, package imports, widget layers, and documentation paths. Run `npm run typecheck` and focused tests before treating a new seam as valid.
