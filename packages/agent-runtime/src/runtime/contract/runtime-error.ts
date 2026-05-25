import type { RuntimeErrorCode } from "./runtime-event.js";

/**
 * Expected runtime failures use the same code set as runtime error events.
 *
 * This keeps Effect failures and streamed `runtime.error` payloads aligned
 * without leaking provider-specific error classes over package boundaries.
 */
export class AgentRuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}
