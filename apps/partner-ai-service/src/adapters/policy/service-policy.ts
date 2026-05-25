import {
  POLICY_DENIAL_CODES,
  type PolicyDecision,
  type PolicyPort,
} from "@side-chat/partner-ai-core";

export type ServicePolicyConfig =
  | {
      readonly profile: "development";
      readonly mode?: "allow_all" | "fail_closed";
    }
  | {
      readonly profile: "production";
      readonly mode: "fail_closed" | "configured" | "allow_all";
      readonly allowedModels?: readonly string[];
    };

export class ServicePolicyConfigurationError extends Error {
  readonly code = "production_policy_required";

  constructor(message: string) {
    super(message);
    this.name = "ServicePolicyConfigurationError";
  }
}

export const createDefaultPolicyConfig = (
  profile: ServicePolicyConfig["profile"],
): ServicePolicyConfig =>
  profile === "production" ? { profile, mode: "fail_closed" } : { profile, mode: "allow_all" };

export const createServicePolicyPort = (config: ServicePolicyConfig): PolicyPort => {
  if (config.profile === "production" && config.mode === "allow_all") {
    throw new ServicePolicyConfigurationError(
      "Production policy cannot use the allow-all adapter.",
    );
  }

  return {
    evaluate: (input) => {
      if (config.mode === "fail_closed") {
        return Promise.resolve(failClosedDecision());
      }

      if (config.mode === "configured") {
        return Promise.resolve(
          (config.allowedModels ?? []).includes(input.modelId)
            ? { allowed: true }
            : modelUnavailableDecision(input.modelId),
        );
      }

      return Promise.resolve({ allowed: true });
    },
  };
};

const failClosedDecision = (): PolicyDecision => ({
  allowed: false,
  check: "entitlement",
  code: POLICY_DENIAL_CODES.productionPolicyRequired,
  protocolCode: "forbidden",
  message:
    "Production policy is fail-closed until entitlement and model availability are configured.",
});

const modelUnavailableDecision = (modelId: string): PolicyDecision => ({
  allowed: false,
  check: "model_availability",
  code: POLICY_DENIAL_CODES.modelUnavailable,
  protocolCode: "forbidden",
  message: `Model ${modelId} is not available for this workspace.`,
});
