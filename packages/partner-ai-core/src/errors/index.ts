import type { ProtocolErrorCode } from "@side-chat/chat-protocol";
import type { AuthorityDenialCode } from "#domain/authority";
import type { PolicyDenialCode } from "#policies/policy";

export type BackendFailureCode =
  | AuthorityDenialCode
  | PolicyDenialCode
  | "runtime_failed"
  | "persistence_failed"
  | "invalid_runtime_sequence";

export class PartnerAiCoreError extends Error {
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
    this.name = "PartnerAiCoreError";
    this.code = code;
    this.protocolCode = protocolCode;
    this.retryable = retryable;
  }
}

export const mapAuthorityDenialToError = (
  code: AuthorityDenialCode,
  message: string,
): PartnerAiCoreError =>
  new PartnerAiCoreError(code, message, code === "missing_auth" ? "unauthorized" : "forbidden");
