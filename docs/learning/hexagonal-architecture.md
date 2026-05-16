# Hexagonal Architecture From Scratch

Status: learning guide

This guide explains ports and adapters using this repo. The point is not to memorize a folder pattern. The point is to see which code is inside the application and which code is outside.

## The Basic Idea

Hexagonal architecture says:

```txt
Application core
  talks through ports
    to adapters
      that handle outside technologies
```

The outside technologies can be HTTP, React, Postgres, AI SDK, file systems, report generation, or a browser host app.

The application should not need to know those technologies directly. It should know the conversation it is having with them.

## Port

A port is an interface for a purposeful conversation.

In this repo:

- `ModelPort` means "stream model output for this model request"
- `ConversationRepository` means "store and read conversation messages"
- `UsagePort` means "record and read token usage"
- `WorkbenchToolsPort` means "query approved Workbench data for assistant tools"
- `WorkbenchReportPort` means "generate a report from approved Workbench data"

Notice what these names do not say. They do not say OpenAI, Hono, Postgres table, AG Grid, or Playwright. That is intentional.

## Adapter

An adapter is the technology-specific implementation of a port.

In this repo:

- Hono route handlers adapt HTTP requests into application calls.
- `openAiModelAdapter` adapts AI SDK `streamText` output into `ModelChunk`.
- DB adapters adapt stored-procedure calls into repository methods.
- The widget hook adapts SSE frames into React message state.
- The host bridge adapts serializable `HostCommand` objects into real host UI behavior.

## Inside And Outside

The inside is application meaning:

```txt
"Given this user message, stream an assistant response for this workspace."
```

The outside is technology:

```txt
HTTP request
SSE response
OpenAI provider stream
Postgres connection
React component state
AG Grid table view
PDF report generation
```

The architecture goal is to keep the inside stable while adapters change.

## Applying It To Side Chat

Current flow:

```txt
Hono route
  -> streamChat use case
  -> ModelPort
  -> AI SDK adapter
  -> sidechat.v1 events
  -> widget
```

The good part: `streamChat` already depends on ports, not directly on Hono or React.

The transition that already happened: the old Hono entrypoint used to do too many jobs. It mixed route setup, dependency construction, repositories, Workbench tool data, reports, and response helpers.

The current shape is cleaner: `apps/side-chat-api/src/inbound/hono/index.ts` is a thin re-export, `app.ts` creates the Hono app, route behavior is split under `routes/`, and composition lives under `composition/`. The remaining lesson is still the same: Hono should translate HTTP into use-case calls; it should not become the application architecture.

Target flow:

```txt
Hono inbound route
  -> application use case
    -> ports
      -> adapters
```

Each adapter can then be tested or swapped without rewriting the use case.

## Layer Import Aliases

The backend uses package-local aliases to make layer crossings visible:

```ts
import { streamChat } from "#application/stream-chat.js";
import type { ModelPort } from "#ports/index.js";
import { openAiModelAdapter } from "#adapters/ai/openai-model.js";
import { createApp } from "#inbound/hono/app.js";
```

These aliases are not magic architecture. They are labels, and the governance check turns the most important directions into automated rules. The mental model is still:

- application code may depend on ports
- adapters implement ports
- inbound HTTP code calls application use cases
- application code must not depend on inbound HTTP or concrete adapters

Keep relative imports for small same-layer neighbors, such as route modules importing nearby response helpers. Use aliases when the code crosses a hexagonal layer.

## What Is Not A Port

Do not make everything a port.

These usually do not need ports:

- string formatters
- date formatters
- pure sorting helpers
- pure filtering helpers
- constants
- small DTO mappers with no external dependency

Use a port when the application talks to an external capability or a replaceable boundary.

## Why This Helps Your Work Argument

Your workplace concern was not "Python is bad." The sharper argument is:

```txt
Do not let a deployed backend wrapper become the chat product boundary by accident.
```

Ports/adapters gives you language for that:

- The UI-facing chat protocol is a primary product boundary.
- The model provider is a secondary adapter.
- A Python agent service can be another secondary adapter if complex agent workflows require it.
- The Workbench UI should not depend on provider runtime events.

This lets you say: Python can exist behind the port, but the Workbench chat product still needs a typed, deliberate frontend/backend protocol.

## Study Path

Read in this order:

1. [../architecture/current.md](../architecture/current.md)
2. [../../SYSTEM-DESIGN.md](../../SYSTEM-DESIGN.md)
3. [../architecture/target.md](../architecture/target.md)
4. [frontend-backend-boundaries.md](./frontend-backend-boundaries.md)
5. [ai-sdk-streaming-and-tools.md](./ai-sdk-streaming-and-tools.md)
6. [effect-ts.md](./effect-ts.md)

## Reference

- Alistair Cockburn, Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
