# Frontend And Backend Boundaries From Scratch

Status: learning guide

This guide explains how the reusable widget, embedded host app, shared protocol, and backend fit together.

## The Three Frontend Actors

There are three frontend-ish things in this repo:

| Actor | Role |
| --- | --- |
| `packages/side-chat-widget` | Reusable chat package. It renders and consumes the chat protocol. |
| `apps/embedded-host-app` | Realistic Workbench host. It owns dashboard UI and host-specific state. |
| `apps/widget-demo` | Isolated widget playground. It proves package states and API behavior. |

The widget is not the host app. The host app is not the widget. That separation is the reuse story.

## The Backend Actors

There are also two backend apps:

| App | Role |
| --- | --- |
| `apps/side-chat-api` | Chat streaming backend. Owns chat routes, use case composition, model adapter wiring, history/usage endpoints, and stream responses. |
| `apps/dashboard-data-api` | Read-only dashboard data API for the embedded host app. |

These are separate concerns. The dashboard can render without chat. Chat can stream without owning the dashboard page.

## The Shared Protocol

`packages/shared-protocol` is the contract package.

It defines:

- request shape
- stream event shapes
- host context shape
- host command shape
- usage shape
- headers
- SSE encoding/parsing
- stream sequence validation

Effect Schema is the source of truth for those shapes. The exported TypeScript types are derived from the schemas, and consumers should decode unknown data through shared validation helpers.

Zod can still appear inside adapters that require Zod-compatible input schemas, but it does not define `sidechat.v1`.

This is why the widget and backend can evolve together without passing raw provider objects around.

## Widget Boundary

The widget should know:

- stream URL
- history URL
- usage URL
- workspace/user/conversation identity
- available models for display/demo
- how to ask the host for context
- how to dispatch host commands

The widget should not know:

- AG Grid APIs
- dashboard reducer internals
- Postgres
- Hono route internals
- AI SDK provider internals
- Workbench feature module imports

The widget asks through interfaces. The host decides how to fulfill them.

Inside the package, the widget is split by ownership:

```txt
domain/       reusable rules such as panel geometry and message presentation
application/  boundary workflows such as Effect stream decoding
hooks/        browser transport and host bridge adapters
ui/           React components
```

That is hexagonal architecture on the frontend: React is one adapter around the reusable widget core, not the whole design.

## Host Bridge

The host bridge is the boundary between generic chat and specific Workbench UI.

The widget can call:

```txt
host.getContext()
```

The host returns a serializable snapshot:

```txt
page id
page title
resources
columns
capabilities
metadata
```

The backend can later emit a command:

```txt
sidechat.host_command
```

The widget can call:

```txt
host.dispatchCommand(command)
```

The host chooses how to apply it.

## Why This Is Better Than Importing Host Internals

If the widget imported AG Grid or dashboard files directly, it would stop being reusable. It would become a UBS Workbench component only.

With the host bridge:

- the widget stays generic
- the host keeps control of its UI
- commands stay serializable
- tests can fake host behavior
- future hosts can provide different resources

## The One-Conversation Demo Assumption

The embedded demo intentionally uses one fixed conversation id. That is not a current architecture defect.

Why this is acceptable now:

- the goal is architecture and learning
- the demo is single-page
- multi-conversation lifecycle would add product scope
- the protocol already has `conversationId` for later expansion

Do not spend refactor energy here unless the product goal changes.

## Model Picker Assumption

The visible model picker is a demo affordance and easter egg. It does not need to become a fully real provider-switching product now.

The architecture still supports model metadata because `ModelSelection` is part of the protocol.

## Dashboard Data Boundary

The host dashboard fetches page data from `apps/dashboard-data-api`.

The assistant may need the same data for tools, but that should be an explicit backend adapter decision. The chat API should not become the general dashboard data service by accident.

Target:

```txt
Host dashboard reads
  -> dashboard-data-api
  -> packages/db

Assistant tool context
  -> WorkbenchToolsPort adapter
  -> packages/db or approved dashboard data boundary
```

Both can share the same DB package without sharing ownership of the same application boundary.

## What To Study In Code

Read in this order:

1. `packages/side-chat-widget/src/index.ts`
2. `packages/side-chat-widget/src/SideChatWidget.tsx`
3. `packages/side-chat-widget/src/application/stream-event-decoder.ts`
4. `packages/side-chat-widget/src/domain/message-presentation.ts`
5. `packages/side-chat-widget/src/hooks/use-side-chat.ts`
6. `packages/shared-protocol/src/sidechat.v1/schemas.ts`
7. `apps/embedded-host-app/src/shared/host-surface/HostSurfaceProvider.tsx`
8. `apps/embedded-host-app/src/features/advisory-workbench/model/side-chat-host.ts`
9. `apps/embedded-host-app/src/features/advisory-workbench/ui/AdvisoryWorkbenchPage.tsx`
10. `apps/dashboard-data-api/src/app.ts`

The lesson: reusable UI is created by explicit contracts, not by hiding app-specific imports in a package.

## References

- Hono documentation, Middleware and typed context: https://hono.dev/docs/guides/middleware
- AI SDK documentation, Stream Protocols: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
