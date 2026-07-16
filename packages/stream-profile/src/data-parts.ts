/** The Side Chat `data-*` part surface; native metadata is not a data part. */
export type SideChatDataParts = Readonly<Record<never, never>>;

/** The pinned UI message stream protocol version. Both sides move together. */
export const SIDE_CHAT_STREAM_PROTOCOL = {
  HEADER: "x-vercel-ai-ui-message-stream",
  VERSION: "v1",
} as const;

/** Browser-held authority for executing client tools on one durable run. */
export const SIDE_CHAT_CLIENT_TOOL_CAPABILITY = {
  BYTE_LENGTH: 32,
  HEADER: "x-sidechat-client-tool-capability",
  HEX_LENGTH: 64,
} as const;
