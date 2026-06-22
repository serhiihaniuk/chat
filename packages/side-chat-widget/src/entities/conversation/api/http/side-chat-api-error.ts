export const SIDE_CHAT_API_ERROR_CODES = {
  HTTP_ERROR: "http_error",
  NETWORK_ERROR: "network_error",
  ABORTED: "aborted",
  MALFORMED_STREAM: "malformed_stream",
  MISSING_TERMINAL: "missing_terminal",
  // The turn's durable log can no longer be replayed (pruned, or the turn is
  // gone). Callers fall back to conversation history and clear the active run.
  REPLAY_EXPIRED: "replay_expired",
} as const;

export type SideChatApiErrorCode =
  (typeof SIDE_CHAT_API_ERROR_CODES)[keyof typeof SIDE_CHAT_API_ERROR_CODES];

/**
 * Extra context kept inside the widget API boundary for request failures.
 *
 * The public widget reports user-safe messages, while this error preserves the
 * HTTP status, retry attempt, and original cause for callers that need
 * diagnostics. Provider DTOs, raw protocol frames, and server internals are not
 * part of this shape.
 */
export type SideChatApiErrorOptions = {
  readonly cause?: unknown;
  readonly status?: number | undefined;
  readonly attempt?: number | undefined;
};

/**
 * Widget-owned error type for HTTP resources and sidechat.v1 SSE decoding.
 *
 * Browser callers can branch on the stable `code` values without importing
 * transport, Effect, or runtime details. The optional status and attempt fields
 * are best-effort diagnostics, not a guarantee that every failure reached HTTP.
 */
export class SideChatApiError extends Error {
  readonly code: SideChatApiErrorCode;
  readonly status?: number | undefined;
  readonly attempt?: number | undefined;

  constructor(code: SideChatApiErrorCode, message: string, options: SideChatApiErrorOptions = {}) {
    super(message, withCause(options.cause));
    this.name = "SideChatApiError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.attempt !== undefined) this.attempt = options.attempt;
  }
}

const withCause = (cause: unknown): ErrorOptions | undefined =>
  cause === undefined ? undefined : { cause };
