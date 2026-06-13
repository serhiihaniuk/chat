# System Overview

Read this when: you need the whole Side Chat system on one page.
Source of truth for: high-level data flow.
Not source of truth for: product identity, detailed package rules, or domain
definitions.

Side Chat is an adoptable enterprise assistant foundation. The consuming host
app stays outside this repo; the repository provides the assistant UI,
browser/server protocol, deployable service composition, core turn lifecycle,
runtime boundary, and extension seams.

## Flow

```txt
host app
-> side-chat-widget
-> chat-client
-> chat-protocol
-> partner-ai-service
-> partner-ai-core
-> agent-runtime
-> provider and runtime tools

agent-runtime
-> RuntimeEvent
-> partner-ai-core
-> SidechatStreamEvent
-> chat-client
-> side-chat-widget
```

## Package Roles

| Area                 | Role                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| Host app             | Owns application data, UI outside Side Chat, and host commands.               |
| `side-chat-widget`   | Renders chat UI and maps protocol events into widget state.                   |
| `chat-client`        | Reads `sidechat.v1` SSE streams in browser-safe TypeScript.                   |
| `chat-protocol`      | Owns browser-facing request/event DTOs and validators.                        |
| `partner-ai-service` | Owns HTTP, auth/config adapters, composition, and SSE transport.              |
| `partner-ai-core`    | Owns product workflow, policy, context, turn lifecycle, and protocol mapping. |
| `agent-runtime`      | Executes one prepared assistant turn and hides AI SDK/provider details.       |
| `db`                 | Owns persistence contracts and repository adapters.                           |

## Core Invariants

- Product policy and context decisions live in `partner-ai-core`.
- Provider and AI SDK details live in `agent-runtime`.
- Browser contracts live in `chat-protocol`, `chat-client`, and the widget.
- Concrete tools are app/service adapters injected through runtime protocols.
- The repo does not ship a production host app.

## Related Docs

- `docs/architecture/foundation-overview.md`
- `docs/architecture/package-map.md`
- `docs/architecture/boundaries.md`
- `docs/domain/lifecycle.md`
