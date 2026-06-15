import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { ServiceCapabilityStatus } from "#composition/capabilities/capability-status";
import type { AuthContextVariables } from "../../middleware/auth-context.js";

/**
 * Register secret-safe liveness and readiness diagnostics.
 *
 * Requests to `/healthz` and `/readyz` receive status from the composed service
 * graph: protocol version, selected runtime ids, adapter labels, and scrubbed
 * capability status. Auth tokens, database URLs, provider options, context
 * content, and raw runtime/provider errors stay hidden.
 */
export const registerHealthRoutes = (
  app: Hono<AuthContextVariables>,
  options: {
    readonly authConfig: ServiceAuthConfig;
    readonly policyConfig: ServicePolicyConfig;
    readonly providerId: string;
    readonly modelId: string;
    readonly persistenceLabel: "memory" | "postgres-drizzle";
    readonly capabilities: ServiceCapabilityStatus;
  },
) => {
  const response = () =>
    Response.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      status: "ok",
      service: "partner-ai-service",
      authProfile: options.authConfig.profile,
      policyMode: options.policyConfig.mode ?? "allow_all",
      providerId: options.providerId,
      modelId: options.modelId,
      persistence: options.persistenceLabel,
      capabilities: options.capabilities,
      hostCommandResults: "disabled",
    });

  app.get("/healthz", response);
  app.get("/readyz", response);
};
