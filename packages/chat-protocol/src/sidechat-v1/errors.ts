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

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[keyof typeof PROTOCOL_ERROR_CODES];

/**
 * Transport-level error codes returned as JSON before any SSE frame.
 *
 * These are deliberately separate from {@link PROTOCOL_ERROR_CODES}: a
 * `sidechat.v1` stream event's `code` is a turn outcome, while these classify why
 * a stream/resolve request could not even open. `REPLAY_EXPIRED` is returned (with
 * HTTP 404) when a finished turn's stream buffer has been reclaimed, so the widget
 * falls back to conversation history and clears the run instead of opening a
 * stream that can never replay. `STREAM_UNAVAILABLE` is returned (with HTTP 409)
 * when the turn is still running but another instance holds its live stream —
 * connection-bound streaming never proxies across instances, so the client polls
 * turn status until the terminal lands in history.
 */
export const TRANSPORT_ERROR_CODES = {
  REPLAY_EXPIRED: "replay_expired",
  STREAM_UNAVAILABLE: "stream_unavailable",
} as const;

export type TransportErrorCode = (typeof TRANSPORT_ERROR_CODES)[keyof typeof TRANSPORT_ERROR_CODES];

/** Why a `stream_unavailable` response could not open the requested stream. */
export const STREAM_UNAVAILABLE_REASONS = {
  NOT_STREAM_OWNER: "not_stream_owner",
} as const;

export type StreamUnavailableReason =
  (typeof STREAM_UNAVAILABLE_REASONS)[keyof typeof STREAM_UNAVAILABLE_REASONS];

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
