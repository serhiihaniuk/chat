# Assistant Turn Lifecycle

Read this when: you need the current and target order of one stream chat
assistant turn.
Source of truth for: where policy, context, runtime execution, terminal events,
and future extension seams enter the turn.
Not source of truth for: package ownership tables or provider/runtime internals.

## Current Spine

The current stream-chat path is:

```txt
HTTP adapter parses ChatStreamRequest and auth
-> streamChatEffect(input)
-> prepareStreamChatTurn(...)
-> createProtocolEventStream(...)
-> runtime.streamEffect(...)
-> protocol terminal finalization
```

| Order | Stage                                       | Owner                                             | Failure behavior                                                 |
| ----: | ------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
|     1 | Validate HTTP/auth/request body             | service route                                     | HTTP/request error                                               |
|     2 | Prove workspace authority                   | `partner-ai-core`                                 | Pre-start rejection                                              |
|     3 | Record request received                     | `partner-ai-core` observability                   | Pre-start rejection                                              |
|     4 | Load and validate host capability manifest  | `partner-ai-core` through port                    | Pre-start rejection                                              |
|     5 | Resolve and validate turn policy decision   | `partner-ai-core` through port                    | Pre-start rejection                                              |
|     6 | Evaluate product policy                     | `partner-ai-core` through port                    | Pre-start rejection                                              |
|     7 | Run turn guards                             | `partner-ai-core` through guard registry port     | Pre-start rejection                                              |
|     8 | Ensure authorized conversation              | `partner-ai-core` through repository port         | Pre-start rejection                                              |
|     9 | Append user message                         | `partner-ai-core` through repository port         | Pre-start rejection                                              |
|    10 | Start assistant turn record                 | `partner-ai-core` through lifecycle port          | Pre-start rejection, with failed turn recording after this point |
|    11 | Prepare context and record context snapshot | `partner-ai-core` through context/lifecycle ports | Pre-start rejection, with failed turn recording                  |
|    12 | Record stream started                       | `partner-ai-core` observability                   | Pre-start rejection                                              |
|    13 | Emit `sidechat.started`                     | protocol stream                                   | Streaming has begun                                              |
|    14 | Execute runtime stream                      | `agent-runtime`                                   | Post-start terminal `sidechat.error`                             |
|    15 | Map RuntimeEvents to protocol events        | `partner-ai-core`                                 | Post-start terminal `sidechat.error`                             |
|    16 | Emit exactly one terminal event             | protocol finalization                             | `sidechat.completed` or `sidechat.error`                         |

## Future Seam Entries

Later implementation phases extend this order without changing the failure
split.

| Seam                     | Target location                                     | Why there                                                                                          |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Memory recall            | During context preparation                          | Memory is model-visible context, not runtime-private behavior.                                     |
| RAG retrieval            | During context preparation                          | Retrieval needs auth, source allowlists, provenance, and token budgeting before the model answers. |
| Research agent           | After guards/policy, before final context selection | Research output becomes context candidates or artifacts, not direct browser protocol events.       |
| Agent executor selection | Before runtime request creation                     | Core chooses an allowed executor; the model does not choose arbitrary execution engines.           |
| Memory write candidates  | After runtime output and policy checks              | Durable memory writes need explicit policy and should not happen silently from raw model claims.   |

## Failure Split

Before `sidechat.started`, setup failures reject the request. The HTTP adapter
can return a request-level error because the browser has not seen product stream
state yet.

After `sidechat.started`, failures become exactly one terminal
`sidechat.error`, so the browser can close the assistant turn as product state
instead of treating the SSE transport as the source of truth.

If an assistant turn record already exists but the protocol stream has not
started, core records the failed turn and still rejects setup. That preserves
durable state without half-opening the browser stream.

## Files To Open

- `packages/partner-ai-core/src/application/stream-chat/stream-chat.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts`
- `docs/domain/lifecycle.md`
- `docs/architecture/stream-chat-flow.md`
