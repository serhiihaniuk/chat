import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { ServiceCapabilityStatus } from "#composition/capabilities/status/capability-status";
import type { ServiceProviderRegistryStatus } from "#composition/providers/service-provider-registry";
import type { ServiceToolRegistryStatus } from "#composition/tools/service-tool-registry";
import type { AuthContextVariables } from "../../middleware/auth-context.js";

/**
 * Register secret-safe liveness and readiness diagnostics.
 *
 * Requests to `/healthz` and `/readyz` receive status from the composed service
 * graph: protocol version, selected runtime ids, provider/tool registry status,
 * adapter labels, and scrubbed capability status. Auth tokens, database URLs,
 * provider secrets, tool payloads, and raw runtime/provider errors stay hidden.
 */
export const registerHealthRoutes = (
  app: Hono<AuthContextVariables>,
  options: {
    readonly authConfig: ServiceAuthConfig;
    readonly policyConfig: ServicePolicyConfig;
    readonly providerId: string;
    readonly modelId: string;
    readonly providers: ServiceProviderRegistryStatus;
    readonly tools: ServiceToolRegistryStatus;
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
      providers: options.providers,
      tools: options.tools,
      persistence: options.persistenceLabel,
      capabilities: options.capabilities,
      hostCommandResults: "disabled",
    });

  app.get("/healthz", response);
  app.get("/readyz", response);
};
