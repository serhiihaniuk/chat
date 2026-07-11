# stream-profile

Read this when: changing the Side Chat profile of the UI message stream — the error-code vocabulary or the `data-*` part surface.

Source of truth for: the shared, browser-safe wire vocabulary imported by both the service scrub filter and the widget.

Not source of truth for: the base stream grammar (AI SDK UI message stream `v1`) or the prose wire contract ([`docs/architecture/stream-profile.md`](../../docs/architecture/stream-profile.md)).

This package is deliberately tiny: type declarations plus the error vocabulary table, no runtime machinery. It is the shrunken successor to the old `chat-protocol`'s legitimate shared-contract role. It is dependency-free and safe to import in a browser bundle.

- `SIDE_CHAT_ERROR_CODES` / `SIDE_CHAT_ERROR_VOCABULARY`: the only codes allowed on an outbound `error` part, each with retryability and a safe, content-free message. The `Record` key type makes the table exhaustive at compile time. The service reuses this vocabulary for its pre-stream HTTP errors too, so a code carries one retryability everywhere.
- `SIDE_CHAT_FINISH_REASONS`: the `finish` part's reason vocabulary (mirrors AI SDK's native `FinishReason`); `content-filter` is a blocked turn, `length` a truncated one.
- `SideChatDataParts`: the `data-*` extension point. Empty at baseline — turn state derives from native parts (ADR 0015). Adding a part requires a schema, a named consumer, and a privacy review.
- `SIDE_CHAT_STREAM_PROTOCOL`: the pinned protocol header and version.
