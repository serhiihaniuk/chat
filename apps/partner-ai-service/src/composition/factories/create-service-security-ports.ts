// Owns: resolving the service auth profile and policy config from options.
// Does not own: auth verification, policy enforcement, persistence selection, or
// any port that touches real users (those are core ports built downstream).

import { createDevelopmentAuthConfig } from "#adapters/auth/service-auth";
import { createDefaultPolicyConfig } from "#adapters/policy/service-policy";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceSecurityBundle } from "./bundle-types.js";

/**
 * Resolve auth and policy for one service instance.
 *
 * The auth profile chooses the policy defaults and later decides whether missing
 * persistence may fall back to memory. Production call sites should pass explicit
 * auth/policy instead of relying on the development fallbacks built here.
 */
export const createServiceSecurityPorts = (
  options: ServiceCompositionOptions,
): ServiceSecurityBundle => {
  const auth = options.auth ?? createDevelopmentAuthConfig(options.workspace);
  const policies = options.policies ?? createDefaultPolicyConfig(auth.profile);
  return { auth, policies };
};
