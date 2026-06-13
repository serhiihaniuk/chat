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

| Order | Stage                                                                                                   | Owner                                             | Failure behavior                                                                       |
| ----: | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
|     1 | Validate HTTP/auth/request body                                                                         | service route                                     | HTTP/request error                                                                     |
|     2 | Prove workspace authority                                                                               | `partner-ai-core`                                 | Pre-start rejection                                                                    |
|     3 | Record request received                                                                                 | `partner-ai-core` observability                   | Pre-start rejection                                                                    |
|     4 | Load and validate host capability manifest                                                              | `partner-ai-core` through port                    | Pre-start rejection                                                                    |
|     5 | Resolve and validate turn policy decision                                                               | `partner-ai-core` through port                    | Pre-start rejection                                                                    |
|     6 | Evaluate product policy                                                                                 | `partner-ai-core` through port                    | Pre-start rejection                                                                    |
|     7 | Run turn guards                                                                                         | `partner-ai-core` through guard registry port     | Pre-start rejection                                                                    |
|     8 | Ensure authorized conversation                                                                          | `partner-ai-core` through repository port         | Pre-start rejection                                                                    |
|     9 | Append user message                                                                                     | `partner-ai-core` through repository port         | Pre-start rejection                                                                    |
|    10 | Start assistant turn record                                                                             | `partner-ai-core` through lifecycle port          | Pre-start rejection, with failed turn recording after this point                       |
|    11 | Prepare context, recall memory, retrieve allowed RAG, run allowed research, and record context snapshot | `partner-ai-core` through context/lifecycle ports | Pre-start rejection, with failed turn recording                                        |
|    12 | Record stream started                                                                                   | `partner-ai-core` observability                   | Pre-start rejection                                                                    |
|    13 | Emit `sidechat.started`                                                                                 | protocol stream                                   | Streaming has begun                                                                    |
|    14 | Execute selected/default AgentExecutor through runtime stream                                           | `agent-runtime`                                   | Post-start terminal `sidechat.error`                                                   |
|    15 | Map RuntimeEvents to protocol events                                                                    | `partner-ai-core`                                 | Post-start terminal `sidechat.error`                                                   |
|    16 | Finalize terminal state and record allowed memory write candidates                                      | protocol finalization                             | `sidechat.completed` or `sidechat.error`; memory write candidate failures are observed |

`AgentRuntimeRequest.executorId` is the current runtime seam for core-selected
execution engines. Missing ids use the default AI SDK tool-loop executor; unknown
ids fail before the executor stream starts. The model never selects an executor.

`ResearchAgentPort` is the current pre-answer research seam. Core runs it during
context preparation only when turn policy allows both retrieval source ids and
the `research_context` workflow. Its output becomes `PreparedTurnContext`
candidates plus workflow artifacts; it is not emitted as browser protocol
events and it does not replace the final runtime executor.

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

Memory recall, RAG retrieval, and research are part of context preparation, so
their failures stay pre-start. Memory write candidates run only after successful
output and policy checks. Those candidate-recording failures are observable side
effects, not a second terminal stream outcome.

## Files To Open

- `packages/partner-ai-core/src/application/stream-chat/stream-chat.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts`
- `docs/domain/lifecycle.md`
- `docs/architecture/stream-chat-flow.md`
