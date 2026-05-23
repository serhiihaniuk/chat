import type { RuntimeErrorCode } from "./events.js";

export class AgentRuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}
