import type {
  ChatStreamRequest,
  ProtocolErrorCode,
} from "@side-chat/chat-protocol";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import { PartnerAiCoreError } from "#errors";

export const POLICY_DENIAL_CODES = {
  rateLimitExceeded: "rate_limit_exceeded",
  entitlementRequired: "entitlement_required",
  modelUnavailable: "model_unavailable",
  productionPolicyRequired: "production_policy_required",
} as const;

export type PolicyDenialCode =
  (typeof POLICY_DENIAL_CODES)[keyof typeof POLICY_DENIAL_CODES];

export type PolicyCheck = "rate_limit" | "entitlement" | "model_availability";

export type PolicyEvaluationInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly providerId: string;
  readonly modelId: string;
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
  readonly evaluate: (input: PolicyEvaluationInput) => Promise<PolicyDecision>;
};

export const allowRequestPolicy = (): PolicyPort => ({
  evaluate: () => Promise.resolve({ allowed: true }),
});

export const denyRequestPolicy = (denial: PolicyDenial): PolicyPort => ({
  evaluate: () => Promise.resolve(denial),
});

export const mapPolicyDenialToError = (
  denial: PolicyDenial,
): PartnerAiCoreError =>
  new PartnerAiCoreError(
    denial.code,
    denial.message,
    denial.protocolCode,
    denial.retryable ?? false,
  );
