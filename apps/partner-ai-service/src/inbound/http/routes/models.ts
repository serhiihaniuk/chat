import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServicePolicyConfig } from "../../../adapters/policy/service-policy.js";
import type { AuthContextVariables } from "../middleware/auth-context.js";
import { DEFAULT_MODEL_ID, DEFAULT_PROVIDER_ID } from "./types.js";

export const registerModelsRoute = (
  app: Hono<AuthContextVariables>,
  policyConfig: ServicePolicyConfig,
) => {
  app.get("/models", (context) =>
    context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      models: [
        {
          providerId: DEFAULT_PROVIDER_ID,
          modelId: DEFAULT_MODEL_ID,
          available: policyConfig.profile === "development",
        },
      ],
    }),
  );
};
