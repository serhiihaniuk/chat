# Side-Chat API Learning Guide

Status: local learning path

Read this when you want to understand the backend chat service as a hexagonal application. This app is the UI-facing chat backend. It owns the product workflow around `sidechat.v1`; it does not expose AI SDK or OpenAI stream shapes to the browser.

## Purpose

`apps/side-chat-api` accepts a typed chat request, streams assistant events, runs model/tool/report adapters, persists conversation history and usage, and exposes small HTTP routes for history, usage, health, models, and generated reports.

```txt
Hono HTTP route
  -> application use case
    -> backend ports
      -> AI SDK adapter / DB adapter / workbench tools / report adapter
  -> sidechat.v1 SSE stream
```

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| Hono inbound routes for the chat service. | Browser rendering or widget state. |
| `streamChat` use case and domain errors. | Raw OpenAI or AI SDK stream events as product protocol. |
| Backend ports for model, tools, repositories, usage, auth, billing, rate limit, telemetry. | Direct table SQL from application code. |
| Adapter composition from environment variables. | Dashboard host UI implementation details. |
| Mapping provider/tool chunks into `sidechat.v1` events. | Shared protocol schema definitions. |

## Read Order

1. [`src/ports/index.ts`](src/ports/index.ts)  
   Learn the backend's internal language first. Every dependency the use case needs is a port here.

2. [`src/application/stream-chat.ts`](src/application/stream-chat.ts)  
   Read the product workflow: decode request, gate access, resolve context, stream model chunks, persist, emit protocol events.

   Then read [`src/application/stream-chat/`](src/application/stream-chat/) for the extracted workflow helpers: event factories, citation/attachment metadata, surface context resolution, and usage cost enrichment.

3. [`src/application/prompt-context.ts`](src/application/prompt-context.ts)  
   See how page context, host context, backend surface state, and recent messages become model input.

4. [`src/adapters/ai/openai-model.ts`](src/adapters/ai/openai-model.ts)  
   See how AI SDK is contained behind `ModelPort`.

5. [`src/adapters/workbench/workbench-tools-adapter.ts`](src/adapters/workbench/workbench-tools-adapter.ts)  
   See how approved dashboard data becomes model tools and citation sources.

   The adapter is intentionally a small composition file. The real helper ownership lives under [`src/adapters/workbench/workbench-tools/`](src/adapters/workbench/workbench-tools/): fallback demo data, citation shaping, and Portfolio Worklist surface-context logic.

6. [`src/adapters/workbench/host-command-tool.ts`](src/adapters/workbench/host-command-tool.ts)
   See where model-facing host UI commands become validated `sidechat.v1` host commands. OpenAI exposes this tool, but does not own grid semantics.

7. [`src/inbound/hono/routes/chat-stream.ts`](src/inbound/hono/routes/chat-stream.ts) and [`src/inbound/hono/response/sse.ts`](src/inbound/hono/response/sse.ts)
   See where HTTP becomes SSE.

8. [`src/inbound/hono/composition/default-deps.ts`](src/inbound/hono/composition/default-deps.ts)
   See how real and fake adapters are selected.

## Key Files

| File | Why it exists |
| --- | --- |
| `src/server.ts` | Node server entry point. Loads `.env`, imports the Hono app, and listens on `PORT` or `3000`. |
| `src/index.ts` | Exports the default Hono app for runtime and tests. |
| `src/inbound/hono/app.ts` | Creates the top-level Hono app and mounts inbound routes. |
| `src/inbound/hono/routes/index.ts` | Registers route groups in one place. |
| `src/inbound/hono/routes/chat-stream.ts` | Owns `POST /chat/stream`: protocol header, request id, request body validation, stream response headers. |
| `src/inbound/hono/routes/history-usage.ts` | Reads history and latest usage through ports. |
| `src/inbound/hono/routes/health-models.ts` | Exposes health and configured models. |
| `src/inbound/hono/routes/reports.ts` | Serves generated report PDFs from the report store. |
| `src/inbound/hono/response/protocol-errors.ts` | Splits pre-stream HTTP errors from in-stream protocol errors. |
| `src/inbound/hono/response/sse.ts` | Converts application events into `text/event-stream` frames. |
| `src/application/stream-chat-request-schema.ts` | Effect decode boundary for unknown JSON request bodies. |
| `src/application/stream-chat/` | Focused helpers used by the main workflow: stream event creation, metadata selection, surface-context lookup, and usage enrichment. |
| `src/application/errors.ts` | Expected use-case failures that can become `sidechat.error`. |
| `src/adapters/ai/fake-model.ts` | Deterministic model adapter for tests and local runs without provider tokens. |
| `src/adapters/workbench/host-command-tool.ts` | Model-facing host command adapter. It owns grid/filter/sort command translation so provider adapters do not. |
| `src/adapters/workbench/workbench-tools/` | Internal Workbench tool slices for deterministic fallback data, citation source shaping, and current table-view calculations. |
| `src/adapters/reports/playwright-report.ts` | Report artifact adapter. It keeps PDF generation out of the use case. |
| `src/inbound/hono/composition/memory-repositories.ts` | In-memory conversation and usage repositories for tests/local fallback. |

## Technology Purpose In Context

### Effect

Effect is used narrowly. The important use is boundary decoding: unknown JSON enters the backend, then `decodeSidechatRequestEffect` turns it into `SidechatRequest` or a typed domain error. The service does not use Effect for every helper because the project is teaching pragmatic boundaries, not framework saturation.

### AI SDK

AI SDK is the provider/tool streaming adapter. `openAiModelAdapter.stream` calls `streamText`, registers controlled tools, and receives provider stream parts. It immediately maps those parts into internal `ModelChunk` values. The application layer then maps `ModelChunk` into `sidechat.v1` events.

The provider adapter may expose a host command tool, but it must not own host UI semantics. Grid filters, sorts, row highlights, resource lookup, and `HostCommand` validation live in the workbench host-command adapter.

The browser never sees AI SDK parts.

### Hono

Hono owns HTTP concerns: routes, query parameters, response headers, status codes, and SSE body construction. It does not own chat orchestration. If a file needs Hono request objects, it belongs under `src/inbound/hono`.

### Postgres

The API talks to persistence through ports. When `DATABASE_URL` exists, `default-deps.ts` gets repositories from `@side-chat/db`. Runtime DB access stays stored-procedure/function based inside `packages/db`.

## Boundary Warnings

- Do not import AI SDK outside `src/adapters/ai`.
- Do not import `pg` here. Use `@side-chat/db`.
- Do not put business workflow inside Hono routes.
- Do not expose `ModelChunk` or AI SDK stream parts to the widget.
- Keep fake model support working; tests should not require `OPENAI_API_KEY`.

## Verification

Run from the repository root:

```sh
npm run build --workspace @side-chat/side-chat-api
npm run verify
```

## Read Next

- [Shared Protocol](../../packages/shared-protocol/LEARNING.md) for `sidechat.v1`.
- [DB Package](../../packages/db/LEARNING.md) for stored-procedure persistence.
- [Side-Chat Widget](../../packages/side-chat-widget/LEARNING.md) for the browser consumer.
