# Stream Chat Use Case

This folder owns one product workflow: convert an authenticated
`ChatStreamRequest` into a valid `sidechat.v1` event stream.

The files are split by the order of the workflow:

```txt
stream-chat.ts
  public entrypoints:
  streamChatEffect

prepare-stream-chat-turn.ts
  pre-stream work that must finish before sidechat.started:
  authority, policy, conversation creation, user-message persistence

protocol-event-stream.ts
  streaming work after sidechat.started:
  runtime event mapping, terminal error handling, final sequence validation

runtime-event-mapper.ts
  pure RuntimeEvent -> sidechat.v1 event mapping

stream-chat-observability.ts
  Effect wrapper around stream lifecycle observation

effect-failures.ts
  stable PartnerAiCoreError mapping for port failures

stream-chat-types.ts
  public and internal types shared by the files above
```

`streamChatEffect(input)` is the native Effect-first API. It reads core services
from the Effect environment and returns
`Stream<SidechatStreamEvent, PartnerAiCoreError>`.

Apps provide concrete ports through `createPartnerAiCoreLayer(...)`. The only
conversion to `AsyncIterable` should happen at the HTTP/SSE response boundary,
where the transport writer requires that shape.

Do not add a second package-level Promise or `AsyncIterable` facade. New callers
should compose an Effect Layer and call `streamChatEffect`.

Before `sidechat.started`, failures are request-level failures. After
`sidechat.started`, runtime failures become terminal `sidechat.error` events so
the browser always sees one terminal protocol event.
