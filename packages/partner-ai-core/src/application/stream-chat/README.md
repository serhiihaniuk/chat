# Stream Chat Use Case

Read this when: editing the core workflow that turns one authenticated chat
request into a valid `sidechat.v1` event stream.
Source of truth for: local stream-chat folder responsibilities.
Not source of truth for: HTTP routing, runtime internals, or widget rendering.

## Files

`application/stream-chat` is one application use case, not a feature or adapter
layer. The subfolders below are lifecycle stages inside one streamed assistant
turn. They may call ports, apply core policy, shape model-visible context, or
map internal runtime events to browser-safe protocol events, but they must not
implement Hono routes, databases, provider SDKs, React state, or other outside
adapters.

| Path                                               | Owns                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `stream-chat.ts`                                   | Public `streamChatEffect` entrypoint.                                                                                    |
| `turn/prepare-stream-chat-turn.ts`                 | Pre-start authority, policy, selected turn guards, conversation, user message, context, and runtime request preparation. |
| `guards/run-turn-guards.ts`                        | Pre-context guard execution and guard failure mapping.                                                                   |
| `history/admit-conversation-history-context.ts`    | Core-owned recent conversation history selector and content-safe history manifest creation.                              |
| `conversation-title/prepare-conversation-title.ts` | Post-success conversation-title lifecycle, sanitization, write-once persistence, and failure observation.                |
| `protocol/protocol-event-stream.ts`                | Runtime event mapping, post-start terminal handling, and sequence validation.                                            |
| `protocol/protocol-terminal-lifecycle.ts`          | Completion/failure persistence and terminal invariants.                                                                  |
| `protocol/runtime-event-mapper.ts`                 | Pure RuntimeEvent to `sidechat.v1` event mapping.                                                                        |
| `observability/stream-chat-observability.ts`       | Effect wrapper around stream lifecycle observation.                                                                      |
| `errors/effect-failures.ts`                        | Stable PartnerAiCoreError mapping for port failures.                                                                     |
| `stream-chat-types.ts`                             | Public and internal types shared by this use case.                                                                       |

## Boundary Rules

- `streamChatEffect(input)` is the native Effect-first API.
- Apps provide concrete ports through `createPartnerAiCoreLayer(...)`.
- `AsyncIterable` conversion belongs at the HTTP/SSE response boundary.
- Pre-start failures reject request setup.
- Profile-selected turn guards run after policy and before conversation
  persistence, context, or runtime tools.
- Conversation title generation runs after successful first exchanges when the
  service enables it. Core owns when it runs, output sanitization, and failure
  isolation; service composition owns the prompt config.
- Post-start runtime failures become terminal `sidechat.error` events.
- Successful streams emit terminal `sidechat.completed`.

## Canonical Docs

- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/package-boundaries.md`
