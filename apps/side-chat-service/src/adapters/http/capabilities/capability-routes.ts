import { Hono } from "hono";

import type { HostContextPolicy } from "#domain/host-context";

import type { AuthVariables } from "../auth-middleware.js";
import { QUERY_HTTP_ROUTES } from "../http-contract.js";

export type ServiceCapabilitiesDto = Readonly<{
  hostContext: Readonly<{ enabled: boolean }>;
}>;

export type CapabilityRouteDependencies = Readonly<{
  hostContextPolicy: HostContextPolicy;
}>;

/** Publish deployment capabilities without exposing their internal limits or policy objects. */
export function createCapabilityRoutes(
  dependencies: CapabilityRouteDependencies,
): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();
  app.get(QUERY_HTTP_ROUTES.CAPABILITIES, (context) =>
    context.json(toServiceCapabilities(dependencies.hostContextPolicy)),
  );
  return app;
}

function toServiceCapabilities(policy: HostContextPolicy): ServiceCapabilitiesDto {
  return { hostContext: { enabled: policy.enabled } };
}
