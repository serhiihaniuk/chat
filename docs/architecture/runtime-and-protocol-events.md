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
| `RuntimeEvent` (`runtime.*`) | `ai-runtime-contract` | core <-> runtime | `RUNTIME_EVENT_TYPES`, `packages/ai-runtime-contract/src/index.ts:113` |
| `SidechatStreamEvent` (`sidechat.*`) | `chat-protocol` | browser <-> service | `SIDECHAT_EVENT_TYPES`, `packages/chat-protocol/src/sidechat-v1/events/event-union.ts` |

`RuntimeEvent` and `SidechatStreamEvent` look alike but are different types:
different enum strings (`runtime.*` vs `sidechat.*`), different id brands, and
different membership. One protocol event has no runtime source at all:
`sidechat.history` is defined in the union but never emitted by any server code
today (see the taxonomy note below).

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
| AI SDK part -> `RuntimeEvent` | `mapAiSdkStreamPart` | `packages/agent-runtime/src/runtime/ai-sdk/streaming/stream-part-mapper.ts` |
| AI SDK tool parts -> activity row | `mapAiSdkToolActivity` | `packages/agent-runtime/src/runtime/ai-sdk/streaming/tool-activity-mapper.ts` |
| `RuntimeEvent` -> `SidechatStreamEvent` | `mapRuntimeEvent` | `packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts:52` |
| `SidechatStreamEvent` -> SSE text | `encodeSseEvent` | `packages/chat-protocol/src/sidechat-v1/codec/sse-codec.ts` |
| SSE bytes -> validated event | `decodeChunkedSseStream` | `packages/side-chat-widget/src/entities/conversation/api/sse/side-chat-sse-reader.ts` |
| event -> `WidgetRunState` | `widgetRunReducer` | `packages/side-chat-widget/src/features/chat/model/run/widget-run-reducer.ts` |

Two rules surprise newcomers:

- **`runtime.started` is dropped, not forwarded.** Core emits its own
  `sidechat.started` when the turn is prepared, so `mapRuntimeEvent` returns
  `undefined` for `runtime.started`.
- **Sequence is renumbered at the core boundary.** Runtime keeps an internal
  sequence; core assigns the browser sequence fresh (`sidechat.started` = 0,
  then +1 per emitted event). Runtime numbers never leak to the browser.

## RuntimeEvent Taxonomy

Provider-neutral, internal to the core <-> runtime boundary. Every event carries
`requestId`, `assistantTurnId`, and `sequence`. Defined in
`packages/ai-runtime-contract/src/index.ts`.

| `type` | Key fields |
|---|---|
| `runtime.started` | `providerId`, `modelId` |
| `runtime.output_delta` | `content` |
| `runtime.activity` | `activityId`, `activityKind`, `status`, `title`, `body?`, `details?` |
| `runtime.completed` | `finishReason`, `usage?` |
| `runtime.error` | `code`, `message`, `retryable` |
| `runtime.blocked` | `reason`, `publicMessage` |

`RuntimeTerminalEvent` = `completed | error | blocked`. Activity kinds are
`progress`, `reasoning`, `tool`, and `host_command`
(`runtime-activity.ts:12`) — the runtime emits `host_command` when the model
calls a declared host command through the tool adapter. `progress` is reserved:
no runtime code produces it today. Error codes and finish reasons are fixed
enums; specific SDK or provider error objects never appear in this contract.

## sidechat.v1 Event Taxonomy

The browser-facing contract. The protocol version literal is `sidechat.v1`
(`packages/chat-protocol/src/sidechat-v1/version.ts:1`). Every event carries
`protocolVersion`, `eventId`, `assistantTurnId`, `sequence`, and `createdAt`.
Defined in `packages/chat-protocol/src/sidechat-v1/events/event-union.ts`.

| `type` | Key fields |
|---|---|
| `sidechat.started` | `conversationId?` |
| `sidechat.delta` | `content` |
| `sidechat.activity` | `activityId`, `activityKind`, `status`, `title`, `body?`, `details?` |
| `sidechat.completed` | `finishReason`, `usage?` |
| `sidechat.error` | `code` (`ProtocolErrorCode`), `message`, `retryable` |
| `sidechat.blocked` | `reason`, `publicMessage` (terminal safety stop) |
| `sidechat.history` | `messages[]` — **defined but never emitted**; no server code produces it and the widget reducer ignores it (removal or use tracked in `plan/35`) |

`TerminalEvent` = `completed | error | blocked`; `sidechat.blocked` is a terminal
safety stop, not a completed answer. `ProtocolErrorCode` (`errors.ts`) is a
larger set than the runtime codes; `mapRuntimeErrorCode` collapses runtime codes
into it and defaults unknown ones to `provider_failed`.

Tool, reasoning, and source output stay inside activity `details`. They never
become top-level conversation messages.

## Transport Contract (SSE)

The per-turn stream is Server-Sent Events. Streaming is connection-bound
([ADR 0007](../adr/0007-connection-bound-streaming.md)):
[`assistant-turn.md`](./assistant-turn.md) owns the lifecycle and the in-memory
registry. This doc owns the wire format and validation.

- **Open:** `POST /chat/runs` returns turn identity JSON, then
  `GET /chat/turns/:assistantTurnId/stream?after=<seq>` opens the SSE stream and
  replays the per-instance registry from `<seq>`. The widget defaults
  `after=-1` to replay from `sidechat.started`.
- **Frame format:** one frame per event, `id`/`event`/`data` lines, blank-line
  separated (`encodeSseEvent`, `sse-codec.ts`):

```txt
id: <eventId>
event: <type>
data: <JSON of the event>

```

- **Server transport:** `streamSseResponse` pipes the Effect `Stream` through
  `Stream.map(encodeSseEvent)` -> `Stream.encodeText` -> `Stream.toReadableStream`
  (`apps/partner-ai-service/src/inbound/http/response/sse.ts`). Headers:
  `content-type: text/event-stream; charset=utf-8`,
  `cache-control: no-cache, no-transform`, `connection: keep-alive`,
  `x-accel-buffering: no`. No hand-rolled controller loop; browser disconnect
  cancels the `ReadableStream` and releases only this subscriber.
- **Sequence numbers:** strictly increasing, starting at `sidechat.started` = 0.
  The server emits a gap-free stream by construction via
  `advanceProtocolStream` (`protocol-stream-state-machine.ts:57`): one
  `started`, one terminal, nothing after the terminal. Validators accept gaps
  because a resume with `after=<seq>` replays a suffix.
- **Terminal event:** `completed | error | blocked` ends the stream. The widget
  reader throws `missing_terminal` if the body ends without one, or
  `malformed_stream` on leftover bytes (`side-chat-sse-reader.ts`).
- **Replay expired:** a `404` before the SSE body means the terminal turn was
  swept from the registry. The widget maps it to `replay_expired` and falls
  back to history. Transport error codes stay separate from in-stream event
  `code`s.

## Validation And Anti-Spoofing

The widget re-decodes and re-validates every frame; it trusts the wire, not the
sender. `decodeChunkedSseStream` splits on blank-line boundaries and calls
`parseSidechatStreamEvent` (`sse-codec.ts`, `validation/validation.ts:38`),
which whitelists fields per event type and rejects DB rows, runtime events, and
unknown fields (`requireKnownKeys`). The frame `id`/`event` lines must match the
JSON payload's `eventId`/`type`, or `assertFrameMatchesPayload` throws
(`sse-codec.ts:64`), so a malformed frame cannot impersonate another event.

The whole-stream validator `validateSidechatEventSequence`
(`ordering/sequence.ts`) checks a complete stream offline (used in tests and
finalization): non-empty, increasing, exactly one terminal, nothing after it.

> Known gap (fix tracked in `plan/16`): `validateSidechatEventSequence` accepts
> only `completed`/`error` as the terminal type and rejects `sidechat.blocked`
> (`ordering/sequence.ts:42`), and the schema JSON omits `blocked`
> (`packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json`).
> The per-event validator, the server state machine, and the widget reader all
> treat `blocked` as terminal, so live code accepts it while the offline
> validator and published schema do not.

## The Two Activity Streams

Two event families share the word "activity" but ride different streams and
codecs. Do not conflate them.

| | `sidechat.activity` | `sidechat.turn-activity` |
|---|---|---|
| Scope | reasoning/tool/host_command steps **inside one turn** | turn lifecycle **across conversations** |
| Stream | the per-turn `/chat/turns/:id/stream` | a separate `GET /chat/activity` SSE stream |
| Purpose | render activity rows in the open chat | the "generating" dot on chats you are not viewing |
| Part of `SidechatStreamEvent`? | yes | no — own type, no sequence, no terminal |
| Codec | `sse-codec.ts` | `activity-sse-codec.ts` |

The cross-conversation stream is already scoped to one (workspace, subject), so
its wire event carries no scope and never closes on its own — it stays open until
the browser disconnects. The widget consumes it through `useActivityStream`
(`packages/side-chat-widget/src/features/chat/model/activity/use-activity-stream.ts`).

## Where Boundaries Are Enforced

This doc states the event-level boundaries; the full import matrix lives in
[`package-boundaries.md`](./package-boundaries.md).

- **AI SDK / provider DTOs stay in `agent-runtime`.** `ai` and `@ai-sdk/*` are
  importable only inside that package (`check-runtime-boundaries.mjs`).
  Downstream packages receive `RuntimeEvent`s, not AI SDK parts.
- **Raw provider errors are scrubbed at the runtime edge.** `toRuntimeError`
  reduces any foreign throw to a stable `AiRuntimeError`; a content-filter
  finish becomes `runtime.blocked` with a fixed `publicMessage`, and the raw
  reason never leaves the package (`stream-part-mapper.ts`).
- **`chat-protocol` is Effect-free and provider-DTO-free.** It holds plain DTOs
  plus hand-written validators — no `effect`, no `ai-runtime-contract`, no
  provider types. Effect appears only at the transport edge (`sse.ts`).
- **The browser never gets runtime, Effect, DB, or provider values.** Core emits
  only `SidechatStreamEvent` through `mapRuntimeEvent`, and
  `mapUnknownRuntimeError` turns stray throws into a public `provider_failed`
  error. The widget is Effect-free and provider-free.

## Files To Open

- RuntimeEvent union + ports: `packages/ai-runtime-contract/src/index.ts`
- AI SDK -> RuntimeEvent: `packages/agent-runtime/src/runtime/ai-sdk/streaming/`
- RuntimeEvent -> sidechat.v1: `packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts`
- Stream gating + state machine: `packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts`
- sidechat.v1 events: `packages/chat-protocol/src/sidechat-v1/events/event-union.ts`
- SSE codec + validation + ordering: `packages/chat-protocol/src/sidechat-v1/`
- Live server transport: `apps/partner-ai-service/src/inbound/http/response/sse.ts`
- Widget decode + state: `packages/side-chat-widget/src/entities/conversation/api/sse/side-chat-sse-reader.ts`
