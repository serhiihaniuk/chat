import type { ProtocolErrorCode } from "@side-chat/chat-protocol";
import type { AuthorityDenialCode } from "./authority.js";

export type BackendFailureCode =
  | AuthorityDenialCode
  | "runtime_failed"
  | "persistence_failed"
  | "invalid_runtime_sequence";

export class BackendCoreError extends Error {
  readonly code: BackendFailureCode;
  readonly protocolCode: ProtocolErrorCode;
  readonly retryable: boolean;

  constructor(
    code: BackendFailureCode,
    message: string,
    protocolCode: ProtocolErrorCode,
    retryable = false,
  ) {
    super(message);
    this.name = "BackendCoreError";
    this.code = code;
    this.protocolCode = protocolCode;
    this.retryable = retryable;
  }
}

export const mapAuthorityDenialToError = (
  code: AuthorityDenialCode,
  message: string,
): BackendCoreError =>
  new BackendCoreError(
    code,
    message,
    code === "missing_auth" ? "unauthorized" : "forbidden",
  );
