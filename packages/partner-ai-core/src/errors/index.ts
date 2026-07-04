import { PROTOCOL_ERROR_CODES, type ProtocolErrorCode } from "@side-chat/chat-protocol";
import type { AuthorityDenialCode } from "#domain/authority";
import type { PolicyDenialCode } from "#policies/policy";

export const PARTNER_AI_CORE_ERROR_CODES = {
  RUNTIME_FAILED: "runtime_failed",
  PERSISTENCE_FAILED: "persistence_failed",
  TURN_GUARD_BLOCKED: "turn_guard_blocked",
  // The conversation already has a turn in flight (a second tab or client). A
  // client-actionable 409, distinct from a server fault, so its message is safe
  // to show and the widget maps it to a notice.
  CONVERSATION_BUSY: "conversation_busy",
  // The service shipped a broken capability menu: a manifest that fails
  // validation or a turn policy that references something unregistered. Distinct
  // from RUNTIME_FAILED so a config typo is never indistinguishable from a
  // provider crash — the issue codes/paths ride along in `issues`.
  CONFIGURATION_INVALID: "configuration_invalid",
  INVALID_RUNTIME_SEQUENCE: "invalid_runtime_sequence",
} as const;

export const PARTNER_AI_CORE_PROTOCOL_ERROR_CODES = {
  UNAUTHORIZED: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
  FORBIDDEN: PROTOCOL_ERROR_CODES.FORBIDDEN,
  CONFLICT: PROTOCOL_ERROR_CODES.CONFLICT,
  PROVIDER_FAILED: PROTOCOL_ERROR_CODES.PROVIDER_FAILED,
  PERSISTENCE_FAILED: PROTOCOL_ERROR_CODES.PERSISTENCE_FAILED,
  INTERNAL_ERROR: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
  MALFORMED_STREAM: PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
} as const;

export type BackendFailureCode =
  | AuthorityDenialCode
  | PolicyDenialCode
  | (typeof PARTNER_AI_CORE_ERROR_CODES)[keyof typeof PARTNER_AI_CORE_ERROR_CODES];

/**
 * One structured validation issue carried by a `configuration_invalid` failure.
 *
 * Keeps the machine-readable `code` and `path` instead of flattening every issue
 * into a space-joined message, so logs and tests can point at the exact field.
 */
export type ConfigurationIssue = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export class PartnerAiCoreError extends Error {
  readonly code: BackendFailureCode;
  readonly protocolCode: ProtocolErrorCode;
  readonly retryable: boolean;
  /** Present on `configuration_invalid` failures; the offending issues, structured. */
  readonly issues?: readonly ConfigurationIssue[] | undefined;

  constructor(
    code: BackendFailureCode,
    message: string,
    protocolCode: ProtocolErrorCode,
    retryable = false,
    issues?: readonly ConfigurationIssue[],
  ) {
    super(message);
    this.name = "PartnerAiCoreError";
    this.code = code;
    this.protocolCode = protocolCode;
    this.retryable = retryable;
    this.issues = issues;
  }
}

/**
 * Build a `configuration_invalid` failure from capability validation issues.
 *
 * The message stays human-readable (issue messages joined) for logs, while the
 * structured `issues` preserve each code+path. The protocol code is
 * `internal_error`: a broken service menu is not something the browser can act
 * on, but the backend code and issues make it distinct from a provider crash.
 */
export const configurationInvalidError = (
  issues: readonly ConfigurationIssue[],
): PartnerAiCoreError =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.CONFIGURATION_INVALID,
    issues.map((issue) => issue.message).join(" "),
    PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    false,
    issues,
  );

/**
 * Build the `conversation_busy` failure for a concurrent turn.
 *
 * The protocol code is `conflict` (HTTP 409): the conversation already has a
 * turn generating, so the client should wait rather than retry blindly. The
 * message is client-safe — it names no internal detail.
 */
export const conversationBusyError = (): PartnerAiCoreError =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.CONVERSATION_BUSY,
    "This conversation already has a turn in progress.",
    PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.CONFLICT,
    false,
  );

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
