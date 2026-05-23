import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServiceAuthConfig } from "../../../adapters/auth/service-auth.js";
import type { ServicePolicyConfig } from "../../../adapters/policy/service-policy.js";
import type { AuthContextVariables } from "../middleware/auth-context.js";
import { DEFAULT_MODEL_ID, DEFAULT_PROVIDER_ID } from "./types.js";

export const registerHealthRoutes = (
  app: Hono<AuthContextVariables>,
  options: {
    readonly authConfig: ServiceAuthConfig;
    readonly policyConfig: ServicePolicyConfig;
    readonly persistenceLabel: "memory" | "postgres-drizzle";
  },
) => {
  const response = () =>
    Response.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      status: "ok",
      service: "partner-ai-service",
      authProfile: options.authConfig.profile,
      policyMode: options.policyConfig.mode ?? "allow_all",
      providerId: DEFAULT_PROVIDER_ID,
      modelId: DEFAULT_MODEL_ID,
      persistence: options.persistenceLabel,
      hostCommandResults: "disabled",
    });

  app.get("/healthz", response);
  app.get("/readyz", response);
};
