import type { ChatStreamRequest, ProtocolErrorCode } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { HostCapabilityManifest, TurnPolicyDecision } from "#domain/capabilities";
import { PartnerAiCoreError } from "#errors";

export const POLICY_DENIAL_CODES = {
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  ENTITLEMENT_REQUIRED: "entitlement_required",
  MODEL_UNAVAILABLE: "model_unavailable",
  PRODUCTION_POLICY_REQUIRED: "production_policy_required",
} as const;

export type PolicyDenialCode = (typeof POLICY_DENIAL_CODES)[keyof typeof POLICY_DENIAL_CODES];

export type PolicyCheck = "rate_limit" | "entitlement" | "model_availability";

export type PolicyEvaluationInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly manifest: HostCapabilityManifest;
  readonly policyDecision: TurnPolicyDecision;
};

export type PolicyGrant = {
  readonly allowed: true;
};

export type PolicyDenial = {
  readonly allowed: false;
  readonly check: PolicyCheck;
  readonly code: PolicyDenialCode;
  readonly protocolCode: ProtocolErrorCode;
  readonly message: string;
  readonly retryable?: boolean;
};

export type PolicyDecision = PolicyGrant | PolicyDenial;

export type PolicyPort = {
  readonly evaluate: (input: PolicyEvaluationInput) => Effect.Effect<PolicyDecision, unknown>;
};

/**
 * Small deterministic policy double for tests and local characterization.
 *
 * Target policy-denial tests stay focused on the core workflow order: policy must
 * fail before conversation persistence or runtime work starts.
 */
export const denyRequestPolicy = (denial: PolicyDenial): PolicyPort => ({
  evaluate: () => Effect.succeed(denial),
});

export const mapPolicyDenialToError = (denial: PolicyDenial): PartnerAiCoreError =>
  new PartnerAiCoreError(
    denial.code,
    denial.message,
    denial.protocolCode,
    denial.retryable ?? false,
  );
