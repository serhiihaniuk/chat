import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { AuthContextVariables } from "../../middleware/auth-context.js";

export const registerModelsRoute = (
  app: Hono<AuthContextVariables>,
  policyConfig: ServicePolicyConfig,
  model: { readonly providerId: string; readonly modelId: string },
) => {
  app.get("/models", (context) =>
    context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      models: [
        {
          providerId: model.providerId,
          modelId: model.modelId,
          available: policyConfig.profile === "development",
        },
      ],
    }),
  );
};
