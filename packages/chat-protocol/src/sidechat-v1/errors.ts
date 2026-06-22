export const PROTOCOL_ERROR_CODES = {
  BAD_REQUEST: "bad_request",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  ABORTED: "aborted",
  TIMEOUT: "timeout",
  PROVIDER_FAILED: "provider_failed",
  TOOL_FAILED: "tool_failed",
  PERSISTENCE_FAILED: "persistence_failed",
  INTERNAL_ERROR: "internal_error",
  MALFORMED_STREAM: "malformed_stream",
  UNSUPPORTED_PROTOCOL: "unsupported_protocol",
} as const;

export type ProtocolErrorCode =
  (typeof PROTOCOL_ERROR_CODES)[keyof typeof PROTOCOL_ERROR_CODES];

/**
 * Transport-level error codes returned as JSON before any SSE frame.
 *
 * These are deliberately separate from {@link PROTOCOL_ERROR_CODES}: a
 * `sidechat.v1` stream event's `code` is a turn outcome, while these classify why
 * a stream/resolve request could not even open. `REPLAY_EXPIRED` is returned (with
 * HTTP 404) when a turn's durable event log has been pruned past the requested
 * replay offset, so the widget falls back to conversation history and clears the
 * run instead of opening a stream that can never replay.
 */
export const TRANSPORT_ERROR_CODES = {
  REPLAY_EXPIRED: "replay_expired",
} as const;

export type TransportErrorCode =
  (typeof TRANSPORT_ERROR_CODES)[keyof typeof TRANSPORT_ERROR_CODES];

export class ProtocolValidationError extends Error {
  readonly code = PROTOCOL_ERROR_CODES.BAD_REQUEST;

  constructor(message: string) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

export class ProtocolSequenceError extends Error {
  readonly code = PROTOCOL_ERROR_CODES.MALFORMED_STREAM;

  constructor(message: string) {
    super(message);
    this.name = "ProtocolSequenceError";
  }
}
