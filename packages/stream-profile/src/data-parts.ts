/** The Side Chat `data-*` part surface; native metadata is not a data part. */
export type SideChatDataParts = Readonly<Record<never, never>>;

/** The pinned UI message stream protocol version. Both sides move together. */
export const SIDE_CHAT_STREAM_PROTOCOL = {
  HEADER: "x-vercel-ai-ui-message-stream",
  VERSION: "v1",
} as const;
