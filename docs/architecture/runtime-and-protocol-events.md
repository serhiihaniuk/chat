# Runtime And Protocol Events

Read this when: you change event shapes, the mapping between them, the SSE wire format, or the widget stream reader.
Source of truth for: the three event vocabularies, the mapping chain, and the streaming/transport contract.
Not source of truth for: the turn lifecycle (`assistant-turn.md`), import/data boundaries (`package-boundaries.md`), or term definitions (`../domain/vocabulary.md`).

One assistant turn produces a stream of events. That stream is rewritten three
times as it crosses package boundaries, so the browser never sees a raw provider
part. This doc names each event family, the function that maps one to the next,
and the rules the SSE wire must obey. For the turn lifecycle around this stream,
read [`assistant-turn.md`](./assistant-turn.md).

## The Three Event Vocabularies

Each vocabulary lives in exactly one package. Never import one where another
belongs — the boundary is the point.

| Vocabulary | Package | Visible to | Enum source |
|---|---|---|---|
| AI SDK stream part (`TextStreamPart`) | `agent-runtime` | runtime internals only | AI SDK `ai` package |
| `RuntimeEvent` (`runtime.*`) | `ai-runtime-contract` | core <-> runtime | `RUNTIME_EVENT_TYPES`, `packages/ai-runtime-contract/src/index.ts:99` |
| `SidechatStreamEvent` (`sidechat.*`) | `chat-protocol` | browser <-> service | `SIDECHAT_EVENT_TYPES`, `packages/chat-protocol/src/sidechat-v1/events/event-union.ts:15` |

`RuntimeEvent` and `SidechatStreamEvent` look alike but are different types:
different enum strings (`runtime.*` vs `sidechat.*`), different id brands, and
different membership. Protocol adds `sidechat.history` and a `host_command`
activity kind; runtime has neither.

## The Mapping Chain

Events flow one direction only, browser-bound. Each hop names the function that
performs it:

```txt
AI SDK stream part        (agent-runtime, private)
  -> mapAiSdkStreamPart / mapAiSdkToolActivity
RuntimeEvent              (ai-runtime-contract)
  -> mapRuntimeEvent
SidechatStreamEvent       (chat-protocol, "sidechat.v1")
  -> encodeSseEvent
SSE wire frame            (id/event/data lines, text/event-stream)
  -> decodeChunkedSseStream + parseSidechatStreamEvent
SidechatStreamEvent       (re-validated in the widget)
  -> widgetRunReducer
WidgetRunState            (UI state, pure reducer)
```

| Hop | Function | File |
|---|---|---|
| AI SDK part -> `RuntimeEvent` | `mapAiSdkStreamPart` | `packages/agent-runtime/src/runtime/ai-sdk/streaming/stream-part-mapper.ts:78` |
| AI SDK tool parts -> activity row | `mapAiSdkToolActivity` | `packages/agent-runtime/src/runtime/ai-sdk/streaming/tool-activity-mapper.ts:43` |
| `RuntimeEvent` -> `SidechatStreamEvent` | `mapRuntimeEvent` | `packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts:49` |
| `SidechatStreamEvent` -> SSE text | `encodeSseEvent` | `packages/chat-protocol/src/sidechat-v1/codec/sse-codec.ts:5` |
| SSE bytes -> validated event | `decodeChunkedSseStream` | `packages/side-chat-widget/src/entities/conversation/api/sse/side-chat-sse-reader.ts:18` |
| event -> `WidgetRunState` | `widgetRunReducer` | `packages/side-chat-widget/src/features/chat/model/run/widget-run-reducer.ts:39` |

Two rules surprise newcomers:

- **`runtime.started` is dropped, not forwarded.** Core emits its own
  `sidechat.started` when the turn is prepared, so `mapRuntimeEvent` returns
  `undefined` for `runtime.started` (`runtime-event-mapper.ts:64`).
- **Sequence is renumbered at the core boundary.** Runtime keeps an internal
  sequence; core assigns the browser sequence fresh (`sidechat.started` = 0,
  then +1 per emitted event). Runtime numbers never leak to the browser.

## RuntimeEvent Taxonomy

Provider-neutral, internal to the core <-> runtime boundary. Every event carries
`requestId`, `assistantTurnId`, and `sequence`. Defined in
`packages/ai-runtime-contract/src/index.ts`.

| `type` | Key fields | Line |
|---|---|---|
| `runtime.started` | `providerId`, `modelId` | `index.ts:163` |
| `runtime.output_delta` | `content` | `index.ts:169` |
| `runtime.activity` | `activityId`, `activityKind`, `status`, `title`, `body?`, `details?` | `index.ts:174` |
| `runtime.completed` | `finishReason`, `usage?` | `index.ts:184` |
| `runtime.error` | `code`, `message`, `retryable` | `index.ts:190` |
| `runtime.blocked` | `reason`, `publicMessage` | `index.ts:203` |

`RuntimeTerminalEvent` = `completed | error | blocked`. Activity kinds are
`progress`, `reasoning`, `tool` (`runtime-activity.ts:12`). Error codes and
finish reasons are fixed enums (`index.ts:130`, `index.ts:143`); specific SDK or
provider error objects never appear in this contract.

## sidechat.v1 Event Taxonomy

The browser-facing contract. The protocol version literal is `sidechat.v1`
(`packages/chat-protocol/src/sidechat-v1/version.ts:1`). Every event carries
`protocolVersion`, `eventId`, `assistantTurnId`, `sequence`, and `createdAt`.
Defined in `packages/chat-protocol/src/sidechat-v1/events/event-union.ts`.

| `type` | Key fields | Line |
|---|---|---|
| `sidechat.started` | `conversationId?` | `event-union.ts:67` |
| `sidechat.delta` | `content` | `event-union.ts:72` |
| `sidechat.activity` | `activityId`, `activityKind`, `status`, `title`, `body?`, `details?` | `event-union.ts:112` |
| `sidechat.completed` | `finishReason`, `usage?` | `event-union.ts:122` |
| `sidechat.error` | `code` (`ProtocolErrorCode`), `message`, `retryable` | `event-union.ts:128` |
| `sidechat.blocked` | `reason`, `publicMessage` (terminal safety stop) | `event-union.ts:141` |
| `sidechat.history` | `messages[]` (replay / initial load) | `event-union.ts:147` |

`TerminalEvent` = `completed | error | blocked`; `sidechat.blocked` is a terminal
safety stop, not a completed answer. Differences from `RuntimeEvent`:

- `sidechat.history` has no runtime equivalent; it carries prior messages on
  replay or first load.
- Activity adds a 4th kind, `host_command` (`event-union.ts:42`), emitted by
  core/host-bridge rather than the runtime adapter.
- `ProtocolErrorCode` (`errors.ts:1`) is a larger set than the runtime codes;
  `mapRuntimeErrorCode` collapses runtime codes into it and defaults unknown ones
  to `provider_failed` (`runtime-event-mapper.ts:148`).

Tool, reasoning, and source output stay inside activity `details`. They never
become top-level conversation messages.

## Transport Contract (SSE)

The per-turn stream is Server-Sent Events. The flow opens in two HTTP calls;
[`assistant-turn.md`](./assistant-turn.md) owns the full lifecycle, and
[ADR 0009](../adr/0009-resumable-server-owned-streaming.md) owns the resumable
design. This doc owns the wire format and validation.

- **Open:** `POST /chat/runs` returns turn identity JSON, then
  `GET /chat/turns/:assistantTurnId/stream?after=<seq>` opens the SSE stream and
  replays the durable log from `<seq>`. The widget defaults `after=-1` to replay
  from `sidechat.started` (`side-chat-turn-stream.ts:15`).
- **Frame format:** one frame per event, `id`/`event`/`data` lines, blank-line
  separated (`encodeSseEvent`, `sse-codec.ts:5`):

```txt
id: <eventId>
event: <type>
data: <JSON of the event>

```

- **Server transport:** `streamSseResponse` pipes the Effect `Stream` through
  `Stream.map(encodeSseEvent)` -> `Stream.encodeText` -> `Stream.toReadableStream`
  (`apps/partner-ai-service/src/inbound/http/response/sse.ts:31`). Headers:
  `content-type: text/event-stream; charset=utf-8`,
  `cache-control: no-cache, no-transform`, `connection: keep-alive`,
  `x-accel-buffering: no` (`sse.ts:9`). No hand-rolled controller loop; browser
  disconnect cancels the `ReadableStream` and releases only this subscriber.
- **Sequence numbers:** strictly monotonic, +1 per event, starting at
  `sidechat.started` = 0. The server guarantees a valid stream by construction
  via `advanceProtocolStream` (`protocol-stream-state-machine.ts:57`): one
  `started`, one terminal, nothing after the terminal.
- **Terminal event:** `completed | error | blocked` ends the stream. The widget
  reader throws `missing_terminal` if the body ends without one, or
  `malformed_stream` on leftover bytes (`side-chat-sse-reader.ts:50`).
- **Replay expired:** a `404` before the SSE body means the durable log was
  pruned. The widget maps it to `replay_expired` and falls back to history
  (`side-chat-turn-stream.ts:62`). Transport error codes stay separate from
  in-stream event `code`s.

## Validation And Anti-Spoofing

The widget re-decodes and re-validates every frame; it trusts the wire, not the
sender. `decodeChunkedSseStream` splits on blank-line boundaries and calls
`parseSidechatStreamEvent` (`sse-codec.ts:14`,
`validation/validation.ts:38`), which whitelists fields per event type and
rejects DB rows, runtime events, and unknown fields
(`requireKnownKeys`, `validation.ts:254`). The frame `id`/`event` lines must match the JSON payload's
`eventId`/`type`, or `assertFrameMatchesPayload` throws (`sse-codec.ts:64`), so a
malformed frame cannot impersonate another event.

The whole-stream validator `validateSidechatEventSequence`
(`ordering/sequence.ts:19`) checks a complete stream offline (used in tests and
finalization): non-empty, monotonic, exactly one terminal, nothing after it.

> Known gap: `validateSidechatEventSequence` accepts only `completed`/`error` as
> the terminal type and rejects `sidechat.blocked` (`ordering/sequence.ts:43`),
> and the generated schema omits `blocked`
> (`packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json`). The
> runtime validator, the server state machine, and the widget reader all treat
> `blocked` as terminal, so code accepts it while the offline validator and
> published schema do not. No test exercises blocked through these paths.

## The Two Activity Streams

Two event families share the word "activity" but ride different streams and
codecs. Do not conflate them.

| | `sidechat.activity` | `sidechat.turn-activity` |
|---|---|---|
| Scope | reasoning/tool/host_command steps **inside one turn** | turn lifecycle **across conversations** |
| Stream | the per-turn `/chat/turns/:id/stream` | a separate `GET /chat/activity` SSE stream |
| Purpose | render activity rows in the open chat | the "generating" dot on chats you are not viewing |
| Part of `SidechatStreamEvent`? | yes | no — own type, no sequence, no terminal |
| Codec | `sse-codec.ts` | `activity-sse-codec.ts:13` |

The cross-conversation stream is already scoped to one (workspace, subject), so
its wire event carries no scope and never closes on its own — it stays open until
the browser disconnects (`sse.ts:44`). The widget consumes it through
`useActivityStream`
(`packages/side-chat-widget/src/features/chat/model/activity/use-activity-stream.ts`).

## Where Boundaries Are Enforced

This doc states the event-level boundaries; the full import matrix lives in
[`package-boundaries.md`](./package-boundaries.md).

- **AI SDK / provider DTOs stay in `agent-runtime`.** `TextStreamPart`,
  `LanguageModel`, and `ToolSet` are imported only under
  `packages/agent-runtime/src/runtime/ai-sdk/**`. Downstream packages receive
  `RuntimeEvent`s, not AI SDK parts.
- **Raw provider errors are scrubbed at the runtime edge.** `toRuntimeError`
  reduces any foreign throw to a stable `AiRuntimeError`
  (`stream-part-mapper.ts:45`); a content-filter finish becomes `runtime.blocked`
  with a fixed `publicMessage`, and the raw reason never leaves the package
  (`stream-part-mapper.ts:96`).
- **`chat-protocol` is Effect-free and provider-DTO-free.** It holds plain DTOs
  plus hand-written validators — no `effect`, no `ai-runtime-contract`, no
  provider types. Effect appears only at the transport edge (`sse.ts:7`).
- **The browser never gets runtime, Effect, DB, or provider values.** Core emits
  only `SidechatStreamEvent` through `mapRuntimeEvent`, and
  `mapUnknownRuntimeError` turns stray throws into a public `provider_failed`
  error (`runtime-event-mapper.ts:132`). The widget is Effect-free and
  provider-free.

## Files To Open

- RuntimeEvent union + ports: `packages/ai-runtime-contract/src/index.ts`
- AI SDK -> RuntimeEvent: `packages/agent-runtime/src/runtime/ai-sdk/streaming/`
- RuntimeEvent -> sidechat.v1: `packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts`
- Stream gating + state machine: `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- sidechat.v1 events: `packages/chat-protocol/src/sidechat-v1/events/event-union.ts`
- SSE codec + validation + ordering: `packages/chat-protocol/src/sidechat-v1/`
- Live server transport: `apps/partner-ai-service/src/inbound/http/response/sse.ts`
- Widget decode + state: `packages/side-chat-widget/src/entities/conversation/api/sse/side-chat-sse-reader.ts`
