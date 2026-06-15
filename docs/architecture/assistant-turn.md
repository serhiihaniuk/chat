# Assistant Turn

Read this when: you need the order of one stream-chat assistant turn.
Source of truth for: request-to-stream lifecycle and pre-start/post-start
failure meaning.
Not source of truth for: package ownership tables or provider adapter internals.

## Request Chain

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

Browser requests do not carry raw system instructions, executor choices, or
provider-native options. Service composition resolves profile system prompt ids
into instructions, core validates the turn policy decision, and runtime receives
one prepared turn.

## Turn Lifecycle

| Order | Stage                                                                                                                                                                                        | Owner                      | Failure behavior                                                                       |
| ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
|     1 | Validate HTTP method, auth, and request body.                                                                                                                                                | service route              | HTTP/request error                                                                     |
|     2 | Prove workspace/project authority.                                                                                                                                                           | core                       | Pre-start rejection                                                                    |
|     3 | Record request received.                                                                                                                                                                     | core observability         | Pre-start rejection                                                                    |
|     4 | Load and validate host capability manifest.                                                                                                                                                  | core through port          | Pre-start rejection                                                                    |
|     5 | Resolve profile, model, tools, executor id, instructions, commands, RAG, memory, research, and approval policy.                                                                              | core policy                | Pre-start rejection                                                                    |
|     6 | Run profile-selected turn guards before private context, persistence, or runtime tools.                                                                                                      | core guard port            | Pre-start rejection                                                                    |
|     7 | Ensure authorized conversation and append the user message.                                                                                                                                  | core repository port       | Pre-start rejection                                                                    |
|     8 | Start the assistant turn record.                                                                                                                                                             | core lifecycle port        | Pre-start rejection, with failed turn recording after this point                       |
|     9 | Prepare context: same-conversation history, host context, memory recall, allowed RAG, allowed research, tool context, artifacts, and context manifest.                                       | core context ports         | Pre-start rejection, with failed turn recording                                        |
|    10 | Record stream started and emit `sidechat.started`.                                                                                                                                           | core/protocol              | Streaming has begun                                                                    |
|    11 | Execute selected AgentExecutor through runtime.                                                                                                                                              | runtime                    | Post-start terminal `sidechat.error`                                                   |
|    12 | Map RuntimeEvents to SidechatStreamEvents.                                                                                                                                                   | core protocol mapper       | Post-start terminal `sidechat.error`                                                   |
|    13 | Finalize terminal state, persist the assistant outcome, optionally run core-owned post-success title generation through the runtime basic agent, and record allowed memory write candidates. | core protocol finalization | `sidechat.completed` or `sidechat.error`; title and memory write failures are observed |

## Extension Timing

- Turn guards run after policy selection and before conversation persistence,
  context gathering, RAG, memory, research, or runtime tools.
- Conversation history, memory recall, RAG retrieval, and research are
  context-preparation work. They happen before `sidechat.started` and use
  policy-allowed conversations, scopes, or source ids.
- Runtime executor selection is part of the turn policy decision. The model does
  not choose an executor.
- Runtime tools are exposed only after policy allows their names and runtime can
  resolve matching executable registrations.
- Conversation title generation runs only after successful assistant output for
  an untitled first exchange. The service owns the prompt config; core owns
  eligibility, no-tools runtime request shape, sanitization, write-once
  persistence, and failure isolation.
- Memory write candidates run after successful assistant output and explicit
  `read_write` memory policy.

## Failure Split

| Phase     | Browser has seen `sidechat.started`? | Product behavior                                |
| --------- | ------------------------------------ | ----------------------------------------------- |
| Setup     | No                                   | Reject setup as request/core error.             |
| Streaming | Yes                                  | Emit exactly one terminal `sidechat.error`.     |
| Success   | Yes                                  | Emit exactly one terminal `sidechat.completed`. |

If an assistant turn record exists before the stream starts, core records the
failed turn and still rejects setup. This preserves durable state without
half-opening a browser stream.

Conversation title and memory write candidate failures are observable side
effects, not a second terminal stream outcome.

## Files To Open

- `packages/partner-ai-core/src/application/stream-chat/stream-chat.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts`
- `packages/partner-ai-core/src/application/stream-chat/README.md`
