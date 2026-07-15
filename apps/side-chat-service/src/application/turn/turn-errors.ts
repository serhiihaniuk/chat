export const TURN_REJECTION_CODES = {
  NOT_FOUND: "conversation_not_found",
  FORBIDDEN: "conversation_forbidden",
  BUSY: "conversation_busy",
  REQUEST_CONFLICT: "turn_request_conflict",
  CAPACITY: "turn_capacity_exhausted",
  RUN_NOT_READY: "turn_run_not_ready",
  RUN_NOT_FOUND: "turn_run_not_found",
  CLIENT_TOOL_NOT_READY: "client_tool_dispatch_not_ready",
  CLIENT_TOOLS_UNAVAILABLE: "client_tools_require_persistence",
  TOOL_APPROVAL_NOT_READY: "tool_approval_not_ready",
  TOOL_APPROVAL_CONFLICT: "tool_approval_conflict",
  INVALID_TOOL_APPROVAL: "invalid_tool_approval",
  MODEL_NOT_ALLOWED: "model_not_allowed",
} as const;

export type TurnRejectionCode = (typeof TURN_REJECTION_CODES)[keyof typeof TURN_REJECTION_CODES];

export class TurnRejectedError extends Error {
  constructor(
    readonly code: TurnRejectionCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "TurnRejectedError";
  }
}
