/** The Side Chat `data-*` part surface; native metadata is not a data part. */
export type SideChatDataParts = Readonly<Record<never, never>>;

/** Runtime registry for public Side Chat `data-*` chunk discriminants. Empty at baseline. */
export const SIDE_CHAT_DATA_PART_TYPES = [] as const satisfies readonly `data-${string}`[];

/** The pinned UI message stream protocol version. Both sides move together. */
export const SIDE_CHAT_STREAM_PROTOCOL = {
  HEADER: "x-vercel-ai-ui-message-stream",
  VERSION: "v1",
} as const;

/**
 * Browser-held authority for executing client tools on one durable run.
 *
 * The raw value appears only in the dedicated HTTP header. It must not enter UI
 * stream chunks, logs, Workflow state, journal rows, or product tables; durable
 * coordination stores only its digest.
 */
export const SIDE_CHAT_CLIENT_TOOL_CAPABILITY = {
  BYTE_LENGTH: 32,
  HEADER: "x-sidechat-client-tool-capability",
  HEX_LENGTH: 64,
} as const;
