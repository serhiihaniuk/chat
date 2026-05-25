import type { RuntimeErrorCode } from "./runtime-event.js";

export class AgentRuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}
