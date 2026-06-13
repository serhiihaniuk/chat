# Stream Chat Flow

Read this when: you need the main assistant-turn flow from service input to
browser events.
Source of truth for: stream-chat stage order and failure handoff.
Not source of truth for: every helper implementation.

## Stage Table

| Stage | Package/file area  | What it proves, records, or prepares                                                              | Failure behavior                                   | Output                                     |
| ----: | ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
|     1 | service route      | Parses HTTP body and auth context.                                                                | HTTP/request error.                                | ChatStreamRequest plus auth.               |
|     2 | service adapter    | Builds StreamChatInput from protocol request and service context.                                 | HTTP/request error.                                | StreamChatInput.                           |
|     3 | core authorization | Proves workspace/project access before writes.                                                    | Pre-start rejection.                               | Authorized request context.                |
|     4 | turn policy        | Resolves allowed profile, model, tools, host commands, and approval requirements.                 | Pre-start rejection.                               | Turn plan.                                 |
|     5 | turn guards        | Checks user text against selected profile and safety policy.                                      | Pre-start rejection.                               | Allow, warning, or block decision.         |
|     6 | conversation       | Loads or creates authorized conversation.                                                         | Pre-start rejection.                               | Conversation ref.                          |
|     7 | user message       | Persists visible user message.                                                                    | Pre-start rejection.                               | User message record/ref.                   |
|     8 | assistant turn     | Starts assistant turn record.                                                                     | Pre-start rejection when not started.              | Assistant turn ref.                        |
|     9 | prepared context   | Builds and records host, memory, allowed RAG, allowed research, and tool context sent to runtime. | Pre-start rejection when not started.              | Prepared context, artifacts, and manifest. |
|    10 | started event      | Emits `sidechat.started`.                                                                         | After this point, failures become terminal events. | Started protocol event.                    |
|    11 | runtime stream     | Executes AgentRuntimeRequest through the selected/default AgentExecutor.                          | Runtime failure maps to post-start terminal error. | RuntimeEvents.                             |
|    12 | protocol mapping   | Maps RuntimeEvents to SidechatStreamEvents.                                                       | Mapping failure maps to terminal error.            | Protocol stream events.                    |
|    13 | finalization       | Validates terminal event, persists turn outcome, and records memory write candidates.             | Error terminal on runtime/protocol failure.        | `sidechat.completed` or `sidechat.error`.  |

## Spine Function Rule

The stream-chat spine coordinates authorization, policy, persistence, runtime,
protocol mapping, and terminal semantics. Its top-level functions should read as
named stages. Step comments should explain what a stage proves, records, hides,
prepares, or finalizes.

## Failure Split

| Phase     | Browser has seen `sidechat.started`? | Product behavior                                 |
| --------- | ------------------------------------ | ------------------------------------------------ |
| Setup     | No                                   | Reject setup as request/core error.              |
| Streaming | Yes                                  | Emit terminal `sidechat.error` exactly once.     |
| Success   | Yes                                  | Emit terminal `sidechat.completed` exactly once. |

## Related Docs

- `docs/architecture/assistant-turn-lifecycle.md`
- `docs/domain/lifecycle.md`
- `docs/architecture/effect-style.md`
- `packages/partner-ai-core/src/application/stream-chat/README.md`
