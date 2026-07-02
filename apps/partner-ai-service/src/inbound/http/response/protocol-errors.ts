import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_PROTOCOL_VERSION,
  STREAM_UNAVAILABLE_REASONS,
  TRANSPORT_ERROR_CODES,
  type ProtocolErrorCode,
} from "@side-chat/chat-protocol";

export const jsonError = (
  code: ProtocolErrorCode,
  message: string,
  status: number,
  retryable = false,
): Response =>
  Response.json(
    { protocolVersion: SIDECHAT_PROTOCOL_VERSION, code, message, retryable },
    { status },
  );

/** HTTP status the widget maps to `replay_expired` before any SSE frame. */
const REPLAY_EXPIRED_STATUS = 404;

/**
 * Return the transport-level `replay_expired` JSON error before opening SSE.
 *
 * Emitted when a finished turn's stream buffer has been swept from the
 * registry. The status is 404 because the widget's stream client maps a 404 stream
 * open to `replay_expired` and falls back to conversation history; the distinct
 * `code` lets operators tell a pruned-log replay from a genuine unknown turn.
 */
export const replayExpiredError = (message: string): Response =>
  Response.json(
    {
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: TRANSPORT_ERROR_CODES.REPLAY_EXPIRED,
      message,
      retryable: false,
    },
    { status: REPLAY_EXPIRED_STATUS },
  );

/** HTTP status for a stream request that reached the wrong (non-owner) instance. */
const STREAM_UNAVAILABLE_STATUS = 409;

/**
 * Return the transport-level `stream_unavailable` JSON error before opening SSE.
 *
 * Emitted when the turn is still running but this instance holds no registry
 * entry for it — another instance owns the live stream, and connection-bound
 * streaming never proxies across instances. Marked retryable because the turn
 * will reach a durable terminal: the client polls turn status and then reads the
 * answer from conversation history.
 */
export const notStreamOwnerError = (message: string): Response =>
  Response.json(
    {
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: TRANSPORT_ERROR_CODES.STREAM_UNAVAILABLE,
      reason: STREAM_UNAVAILABLE_REASONS.NOT_STREAM_OWNER,
      message,
      retryable: true,
    },
    { status: STREAM_UNAVAILABLE_STATUS },
  );

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected service error.";

const PROTOCOL_ERROR_HTTP_STATUS = {
  [PROTOCOL_ERROR_CODES.BAD_REQUEST]: 400,
  [PROTOCOL_ERROR_CODES.UNAUTHORIZED]: 401,
  [PROTOCOL_ERROR_CODES.FORBIDDEN]: 403,
  [PROTOCOL_ERROR_CODES.NOT_FOUND]: 404,
  [PROTOCOL_ERROR_CODES.CONFLICT]: 409,
  [PROTOCOL_ERROR_CODES.RATE_LIMITED]: 429,
  [PROTOCOL_ERROR_CODES.ABORTED]: 499,
  [PROTOCOL_ERROR_CODES.TIMEOUT]: 504,
  [PROTOCOL_ERROR_CODES.PROVIDER_FAILED]: 502,
  [PROTOCOL_ERROR_CODES.TOOL_FAILED]: 502,
  [PROTOCOL_ERROR_CODES.PERSISTENCE_FAILED]: 500,
  [PROTOCOL_ERROR_CODES.INTERNAL_ERROR]: 500,
  [PROTOCOL_ERROR_CODES.MALFORMED_STREAM]: 400,
  [PROTOCOL_ERROR_CODES.UNSUPPORTED_PROTOCOL]: 400,
} as const satisfies Record<ProtocolErrorCode, number>;

/**
 * Return the HTTP status for a Side Chat error code.
 *
 * Keep the mapping here so individual routes do not invent their own status
 * choices for the same error code.
 */
export const httpStatusForProtocolError = (code: ProtocolErrorCode): number =>
  PROTOCOL_ERROR_HTTP_STATUS[code];
