/**
 * The Side Chat `data-*` part surface.
 *
 * The public stream is AI SDK's UI message stream `v1`; Side Chat adds a
 * deliberately narrow profile on top. At baseline that profile contributes **no**
 * custom `data-*` part: turn state derives from native `start`/`finish`/`abort`
 * parts plus HTTP status (ADR 0015). This map is the single extension point —
 * adding a member here (with a schema, a named consumer, and a privacy review)
 * is the only sanctioned way to introduce a custom part, and it types both the
 * server injector and the widget renderer at once.
 */
export type SideChatDataParts = Readonly<Record<never, never>>;

/** The pinned UI message stream protocol version. Both sides move together. */
export const SIDE_CHAT_STREAM_PROTOCOL = {
  HEADER: "x-vercel-ai-ui-message-stream",
  VERSION: "v1",
} as const;
