# Side Chat vocabulary

Read this when: naming product, Workflow, stream, tool, or persistence concepts.

Source of truth for: repository-wide terms and distinctions.

## Product and turn lifecycle

| Term                    | Meaning                                                                                                                             | Owner                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Side Chat               | The embeddable assistant system in this repository.                                                                                 | Repository                 |
| Conversation            | Durable thread containing user and assistant messages.                                                                              | Product database           |
| User message            | The accepted user-authored message for a turn.                                                                                      | Conversation history       |
| Assistant turn          | One accepted attempt to produce the next assistant message.                                                                         | `sidechat.assistant_turns` |
| Assistant message       | The browser-safe native `UIMessage` persisted when a turn admits visible output.                                                    | Conversation history       |
| `requestId`             | Idempotency identity for one start request within a workspace. Reusing it with different input is a conflict.                       | HTTP/application boundary  |
| `turnId`                | Product identity for an assistant turn.                                                                                             | Product database           |
| `runId`                 | Workflow execution identity bound to an assistant turn.                                                                             | Workflow DevKit            |
| Open turn               | Product turn whose aggregate terminal transition has not committed. It does not imply that a provider is currently generating.      | Product database           |
| Terminal turn           | Turn committed as `completed`, `failed`, or `cancelled`.                                                                            | Product database           |
| Turn admission          | Per-service-process bound applied before the first durable turn write.                                                              | Service application        |
| Admission lease         | Idempotent release handle retained until the accepted run reaches a terminal outcome.                                               | Service application        |
| Exact request replay    | Reuse of the same authorized `requestId` and accepted message to reattach to the already-bound run without another admission lease. | Service application        |
| Effective turn activity | Product/Workflow classification used to distinguish active, starting, terminal, and repair-required turns.                          | Product database queries   |
| Terminal repair         | Guarded reconciliation of an open product turn whose Workflow run is already terminal or irrecoverably absent.                      | Product database           |

## Workflow and streaming

| Term                         | Meaning                                                                                                                                                  | Owner                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Workflow                     | Durable `"use workflow"` function that owns execution, suspension, resume, and terminal return.                                                          | Workflow DevKit                   |
| Step                         | `"use step"` activity used for provider work or database interaction in the appropriate realm.                                                           | Workflow DevKit                   |
| Workflow journal             | Durable raw execution record used for replay and recovery. It is not browser history.                                                                    | Postgres World                    |
| Hook                         | Durable wake-up mechanism for cancellation, client-tool output, or approval decisions. The persisted product row remains decision authority.             | Workflow DevKit                   |
| UI message stream            | AI SDK `v1` stream of native `UIMessageChunk` values returned by start and replay routes.                                                                | AI SDK and service stream edge    |
| Stream profile               | Side Chat's narrow safety profile over the native stream: safe error vocabulary, validated message metadata, terminal discipline, and transport headers. | `@side-chat/stream-profile`       |
| Replay cursor (`startIndex`) | Index in the public UI chunk stream used by `GET /api/chat/:runId/stream`. It is not a raw journal offset.                                               | Service replay adapter            |
| Live tail                    | Stream continuation after all chunks currently durable at replay open.                                                                                   | Workflow replay                   |
| Keepalive                    | Byte-level SSE comment emitted only while a stream is idle. It is not an application event.                                                              | HTTP adapter                      |
| Turn activity event          | Advisory subject-scoped SSE signal that a conversation became running or terminal.                                                                       | Activity route/widget query layer |
| Conversation snapshot        | Coherent authenticated read of messages plus the newest active turn.                                                                                     | Query store                       |

## Models, context, and tools

| Term                   | Meaning                                                                                                                 | Owner                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Model catalog          | Service-published list of selectable model ids and supported reasoning efforts.                                         | Service configuration/composition            |
| Model preference       | Optional per-turn model selection validated against the published catalog.                                              | Turn policy                                  |
| Reasoning effort       | Provider-neutral `low`, `medium`, or `high` selection when the chosen model advertises it.                              | Stream profile/model policy                  |
| Host context           | Optional browser page reference data collected for one opted-in request. It is untrusted context, never authentication. | Host bridge and HTTP validation              |
| Server tool            | Model-callable action executed inside the service Workflow.                                                             | Service tool registry                        |
| Client tool            | Model-callable action executed by the originating browser tab or host page.                                             | Host bridge and durable client-tool dispatch |
| Client-tool capability | High-entropy run-scoped value retained by the originating tab; only its digest crosses into durable execution.          | Widget/HTTP boundary                         |
| Client-tool dispatch   | Durable row binding one tool call, originating-tab digest, and terminal output.                                         | Product database                             |
| Tool approval          | Durable human decision required before an approval-gated server tool executes.                                          | Product database and Workflow wait           |
| Activity item          | Widget-owned normalized display model for reasoning or tool activity.                                                   | Widget                                       |

## Packages and applications

| Name                        | Role                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/side-chat-service`    | Deployable Hono/Nitro service, application policy, Workflow bundles, providers, and composition. |
| `packages/side-chat-widget` | Embeddable React UI and browser transport/state.                                                 |
| `packages/host-bridge`      | Browser-safe host context and client-tool seam.                                                  |
| `packages/db`               | PostgreSQL schema, repositories, notifications, and Workflow journal maintenance.                |
| `packages/stream-profile`   | Dependency-free shared stream vocabulary and validators.                                         |
| `packages/shared`           | Small neutral JSON, branding, and record helpers.                                                |

## Naming rules

- Use `client tool` for browser-executed model actions and `server tool` for service-executed actions.
- Use `run` for Workflow execution and `turn` for the product aggregate.
- Use `journal` for Workflow replay data and `history` for persisted conversation messages.
- Use `active` only for an effectively running Workflow-backed turn; use `open` for incomplete product state.
- Name transformations by source and target. Avoid wide-scope nouns such as `data`, `payload`, `result`, `state`, or `event` when a domain name is available.
