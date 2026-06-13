# Stream Chat Use Case

Read this when: editing the core workflow that turns one authenticated chat
request into a valid `sidechat.v1` event stream.
Source of truth for: local stream-chat folder responsibilities.
Not source of truth for: HTTP routing, runtime internals, or widget rendering.

## Files

| Path                                         | Owns                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `stream-chat.ts`                             | Public `streamChatEffect` entrypoint.                                                              |
| `turn/prepare-stream-chat-turn.ts`           | Pre-start authority, policy, conversation, user message, context, and runtime request preparation. |
| `protocol/protocol-event-stream.ts`          | Runtime event mapping, post-start terminal handling, and sequence validation.                      |
| `protocol/protocol-terminal-lifecycle.ts`    | Completion/failure persistence and terminal invariants.                                            |
| `protocol/runtime-event-mapper.ts`           | Pure RuntimeEvent to `sidechat.v1` event mapping.                                                  |
| `observability/stream-chat-observability.ts` | Effect wrapper around stream lifecycle observation.                                                |
| `errors/effect-failures.ts`                  | Stable PartnerAiCoreError mapping for port failures.                                               |
| `stream-chat-types.ts`                       | Public and internal types shared by this use case.                                                 |

## Boundary Rules

- `streamChatEffect(input)` is the native Effect-first API.
- Apps provide concrete ports through `createPartnerAiCoreLayer(...)`.
- `AsyncIterable` conversion belongs at the HTTP/SSE response boundary.
- Pre-start failures reject request setup.
- Post-start runtime failures become terminal `sidechat.error` events.
- Successful streams emit terminal `sidechat.completed`.

## Related Docs

- `docs/architecture/assistant-turn-lifecycle.md`
- `docs/domain/lifecycle.md`
- `docs/architecture/stream-chat-flow.md`
- `docs/architecture/effect-style.md`
