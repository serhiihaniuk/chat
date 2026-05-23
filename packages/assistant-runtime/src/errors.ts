import type { RuntimeErrorCode } from "./events.js";

export class AssistantRuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "AssistantRuntimeError";
    this.code = code;
  }
}
