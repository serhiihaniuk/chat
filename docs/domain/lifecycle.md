# Side Chat Lifecycle

Read this when: you need the order of one assistant turn, stream, tool, or
terminal state.
Source of truth for: lifecycle order and pre-start/post-start failure meaning.
Not source of truth for: every helper function or package implementation detail.

## Main Request Chain

```txt
browser form submit
-> ChatStreamRequest
-> HTTP adapter validation/auth
-> StreamChatInput
-> streamChatEffect
-> AgentRuntimeRequest
-> RuntimeProviderRequest
-> AI SDK provider request
```

| Stage                   | Owner                           | Product meaning                                            |
| ----------------------- | ------------------------------- | ---------------------------------------------------------- |
| Browser submit          | widget                          | User asks for one assistant turn.                          |
| ChatStreamRequest       | `chat-protocol`                 | Browser-facing payload is validated.                       |
| HTTP adapter            | `partner-ai-service`            | HTTP, auth, and transport details become core input.       |
| StreamChatInput         | `partner-ai-core`               | Product workflow receives an authenticated request.        |
| AgentRuntimeRequest     | `agent-runtime`                 | Runtime receives a prepared turn, not product policy work. |
| RuntimeProviderRequest  | `agent-runtime`                 | Provider/model/tools/messages are ready for AI SDK.        |
| AI SDK provider request | `agent-runtime` private adapter | Provider-native details stay private.                      |

## Event Chain

```txt
AI SDK stream part
-> RuntimeEvent
-> SidechatStreamEvent
-> chat-client decoded event
-> widget message/activity state
```

Runtime events are internal to server packages. `SidechatStreamEvent` is the
browser-facing contract. The widget never sees AI SDK stream parts, provider
DTOs, database rows, Hono objects, or Effect values.

## Assistant Turn Lifecycle

| Order | Stage                                             | Failure behavior                                                    | Output                                    |
| ----: | ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
|     1 | Validate HTTP method, auth, and request body.     | Reject as HTTP/request error.                                       | Valid ChatStreamRequest.                  |
|     2 | Authorize workspace/project scope.                | Reject before `sidechat.started`.                                   | Authorized core input.                    |
|     3 | Decide allowed profile, model, and tools.         | Reject before `sidechat.started`.                                   | Turn plan.                                |
|     4 | Run turn guards before private context/tools.     | Reject before `sidechat.started`.                                   | Allow, warning, or block decision.        |
|     5 | Ensure conversation and persist user message.     | Reject before `sidechat.started`.                                   | Conversation and user message records.    |
|     6 | Start assistant turn and prepare allowed context. | Reject before `sidechat.started` if the browser has not seen start. | Assistant turn and prepared context.      |
|     7 | Emit `sidechat.started`.                          | Stream is now product-started.                                      | Started protocol event.                   |
|     8 | Run agent runtime and map RuntimeEvents.          | Convert post-start failures to terminal `sidechat.error`.           | Deltas, activity, sources, usage.         |
|     9 | Emit terminal event exactly once.                 | Terminal error if runtime/core fails after start.                   | `sidechat.completed` or `sidechat.error`. |

## Tool And Activity Lifecycle

```txt
tool input starts
-> model emits tool call
-> RuntimeTool executes
-> tool result or tool error
-> runtime activity event
-> protocol activity event
-> widget activity item
```

Tool parameters, result, error, and sources stay inside the expandable tool
activity row. They do not become separate top-level timeline rows.

## Terminal Semantics

| Situation                                                       | Product result                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Invalid HTTP request                                            | Request rejects; no stream events are emitted.                                                     |
| Auth, policy, parse, or setup failure before `sidechat.started` | Request rejects; no terminal protocol event is needed.                                             |
| Runtime or mapping failure after `sidechat.started`             | Stream emits exactly one `sidechat.error`.                                                         |
| Successful runtime stream end                                   | Stream emits exactly one `sidechat.completed`.                                                     |
| User abort/cancel                                               | Product state records an interrupted or aborted turn when supported; it is not treated as success. |

## Related Docs

- `docs/architecture/assistant-turn-lifecycle.md`
- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/boundaries.md`
- `docs/domain/vocabulary.md`
