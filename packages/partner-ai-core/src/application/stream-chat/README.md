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

| Path                                                   | Owns                                                                                                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turn/prepare-stream-chat-turn.ts`                     | Pre-start authority, policy, selected turn guards, conversation, user message, and prepared context. Exported as the runner's synchronous pre-start stage.                                                      |
| `guards/run-turn-guards.ts`                            | Pre-context guard execution and guard failure mapping.                                                                                                                                                         |
| `history/admit-conversation-history-context.ts`        | Core-owned recent conversation history selector and content-safe history manifest creation.                                                                                                                    |
| `model-request/build-model-turn-request.ts`            | Final `AiRuntimeRequest` assembly: deterministic message order (system instructions, optional context board, conversation messages) plus provider/model/executor/tool selection from the turn policy decision. |
| `model-request/render-context-board-message.ts`        | Context trust boundary: renders admitted context sections under a stable `# Context Board` header and boundary instruction so browser-supplied host context is reference data, never trusted instructions.     |
| `conversation-title/prepare-conversation-title.ts`     | Post-success conversation-title lifecycle, sanitization, write-once persistence, and failure observation.                                                                                                      |
| `protocol/protocol-event-stream.ts`                    | Post-start protocol event stream (`createProtocolEventStream`): emits `sidechat.started`, maps runtime events, and gates emission through the state machine. Finalization-free so the runner owns terminal persistence. |
| `protocol/run-turn-generation.ts`                      | Server-owned generation: drains the post-start stream to the durable event log and owns finalization through `Effect.onExit`. The service runner forks this off the request.                                    |
| `protocol/protocol-stream-state-machine.ts`            | Live emission gate: rejects a second start, a second terminal, or any event after a terminal so the browser stream is valid by construction.                                                                   |
| `protocol/runtime-event-mapper.ts`                     | Pure RuntimeEvent to `sidechat.v1` event mapping.                                                                                                                                                              |
| `protocol/finalization/protocol-event-accumulator.ts`  | Finalization facts (counts, terminal event, completed usage, assistant text) and after-the-fact stream validation for persistence.                                                                             |
| `protocol/finalization/protocol-terminal-lifecycle.ts` | Completion/failure persistence and terminal invariants after the stream closes.                                                                                                                                |
| `protocol/finalization/finalize-turn-generation.ts`    | `Effect.onExit` finalizer for server-owned generation: durable status on a normal exit, one synthetic aborted terminal on an abnormal exit.                                                                     |
| `observability/stream-chat-observability.ts`           | Effect wrapper around stream lifecycle observation.                                                                                                                                                            |
| `errors/effect-failures.ts`                            | Stable PartnerAiCoreError mapping for port failures.                                                                                                                                                           |
| `stream-chat-types.ts`                                 | Public and internal types shared by this use case.                                                                                                                                                             |

## Boundary Rules

- `prepareStreamChatTurn` + `runTurnGeneration` are the one streaming path: the
  service runner runs pre-start synchronously, then forks generation off the HTTP
  request so a turn outlives any browser connection.
- `createProtocolEventStream` is the post-start stream a subscriber/runner drains;
  it never finalizes, so terminal persistence stays in `run-turn-generation`.
- Apps provide concrete ports through `createPartnerAiCoreLayer(...)` or by passing
  a `StreamChatPorts` object directly to the pre-start/runner entrypoints.
- Stream-to-`ReadableStream`/`AsyncIterable` conversion belongs at the HTTP/SSE
  response boundary, reading replayed events from the durable log.
- Pre-start failures reject request setup.
- Profile-selected turn guards run after policy and before conversation
  persistence, context, or runtime tools.
- Conversation title generation runs after successful first exchanges when the
  service enables it. Core owns when it runs, output sanitization, and failure
  isolation; service composition owns the prompt config.
- Post-start runtime failures become terminal `sidechat.error` events.
- Successful streams emit terminal `sidechat.completed`.
- Protocol-stream validity is enforced twice on purpose: the state machine gates
  each event before it is emitted (one start, one terminal, nothing after a
  terminal), and the accumulator re-checks the emitted events at finalization
  before the turn outcome is persisted.

## Canonical Docs

- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/package-boundaries.md`
