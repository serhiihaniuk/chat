export type ProtocolErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "aborted"
  | "timeout"
  | "provider_failed"
  | "tool_failed"
  | "persistence_failed"
  | "internal_error"
  | "malformed_stream"
  | "unsupported_protocol";

export class ProtocolValidationError extends Error {
  readonly code = "bad_request" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}

export class ProtocolSequenceError extends Error {
  readonly code = "malformed_stream" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProtocolSequenceError";
  }
}
