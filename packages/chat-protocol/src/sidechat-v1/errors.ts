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
