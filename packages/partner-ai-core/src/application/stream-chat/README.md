# Stream Chat Use Case

Read this when: editing the core workflow that turns one authenticated chat
request into a valid `sidechat.v1` event stream.
Source of truth for: local stream-chat folder responsibilities.
Not source of truth for: HTTP routing, runtime internals, or widget rendering.

## Files

| Path                                               | Owns                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `stream-chat.ts`                                   | Public `streamChatEffect` entrypoint.                                                                                    |
| `turn/prepare-stream-chat-turn.ts`                 | Pre-start authority, policy, selected turn guards, conversation, user message, context, and runtime request preparation. |
| `guards/run-turn-guards.ts`                        | Pre-context guard execution and guard failure mapping.                                                                   |
| `history/admit-conversation-history-context.ts`    | Core-owned recent conversation history selector and content-safe history manifest creation.                              |
| `memory/recall-allowed-memory-candidates.ts`       | Policy-scoped memory recall before runtime execution.                                                                    |
| `memory/record-allowed-memory-write-candidates.ts` | Policy-scoped post-turn memory write candidate recording.                                                                |
| `rag/retrieve-allowed-rag-candidates.ts`           | Policy-scoped RAG retrieval and retriever failure mapping before runtime execution.                                      |
| `research/run-allowed-research-agent.ts`           | Policy-scoped pre-answer research and research-output mapping into context candidates/artifacts.                         |
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
- RAG retrieval runs during context preparation from allowed retrieval source ids;
  runtime does not fetch app RAG directly.
- Research runs during context preparation only when research policy and
  retrieval source policy allow it. Research output becomes candidates/artifacts, not
  protocol events or runtime executor selection.
- Memory recall runs during context preparation from allowed scopes. Memory
  write candidates run after successful output and do not silently become raw
  model-claimed durable memory.
- Post-start runtime failures become terminal `sidechat.error` events.
- Successful streams emit terminal `sidechat.completed`.

## Canonical Docs

- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/package-boundaries.md`
