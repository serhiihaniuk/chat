import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type {
  ServiceProviderRegistryStatus,
  ServiceProviderStatus,
} from "#composition/providers/service-provider-registry";
import type { AuthContextVariables } from "../../middleware/auth-context.js";

export const registerModelsRoute = (
  app: Hono<AuthContextVariables>,
  policyConfig: ServicePolicyConfig,
  providers: ServiceProviderRegistryStatus,
) => {
  app.get("/models", (context) =>
    context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      defaultModel: {
        providerId: providers.defaultProviderId,
        modelId: providers.defaultModelId,
      },
      models: providers.providers.flatMap((provider) =>
        modelOptionsForProvider(provider, policyConfig),
      ),
    }),
  );
};

const modelOptionsForProvider = (
  provider: ServiceProviderStatus,
  policyConfig: ServicePolicyConfig,
) =>
  provider.models.map((model) => ({
    providerId: provider.providerId,
    modelId: model.modelId,
    displayName: model.displayName,
    contextWindowTokens: model.contextWindowTokens,
    maxOutputTokens: model.maxOutputTokens,
    default: provider.defaultModelId === model.modelId,
    available: isModelAvailable(policyConfig, model.modelId),
    reasoning: provider.reasoning
      ? {
          defaultEffort: provider.reasoning.effort,
          efforts: provider.reasoning.allowedEfforts,
        }
      : undefined,
  }));

const isModelAvailable = (policyConfig: ServicePolicyConfig, modelId: string): boolean => {
  if (policyConfig.profile === "development") return policyConfig.mode !== "fail_closed";
  if (policyConfig.mode === "configured")
    return (policyConfig.allowedModels ?? []).includes(modelId);
  return false;
};
