import { PROTOCOL_ERROR_CODES, type ProtocolErrorCode } from "@side-chat/chat-protocol";
import type { AuthorityDenialCode } from "#domain/authority";
import type { PolicyDenialCode } from "#policies/policy";

export const PARTNER_AI_CORE_ERROR_CODES = {
  RUNTIME_FAILED: "runtime_failed",
  PERSISTENCE_FAILED: "persistence_failed",
  TURN_GUARD_BLOCKED: "turn_guard_blocked",
  INVALID_RUNTIME_SEQUENCE: "invalid_runtime_sequence",
} as const;

export const PARTNER_AI_CORE_PROTOCOL_ERROR_CODES = {
  UNAUTHORIZED: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
  FORBIDDEN: PROTOCOL_ERROR_CODES.FORBIDDEN,
  PROVIDER_FAILED: PROTOCOL_ERROR_CODES.PROVIDER_FAILED,
  PERSISTENCE_FAILED: PROTOCOL_ERROR_CODES.PERSISTENCE_FAILED,
  INTERNAL_ERROR: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
  MALFORMED_STREAM: PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
} as const;

export type BackendFailureCode =
  | AuthorityDenialCode
  | PolicyDenialCode
  | (typeof PARTNER_AI_CORE_ERROR_CODES)[keyof typeof PARTNER_AI_CORE_ERROR_CODES];

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
  new PartnerAiCoreError(
    code,
    message,
    code === "missing_auth"
      ? PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.UNAUTHORIZED
      : PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.FORBIDDEN,
  );
