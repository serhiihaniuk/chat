// Owns: building the AgentRuntime from the provider and tool bundles, or using
// an injected runtime for tests.
// Does not own: turn profiles (the runtime has none), provider/model
// selection (validated in the provider bundle), or tool exposure policy.

import { createAgentRuntime } from "@side-chat/agent-runtime";
import { PROVIDERS } from "#config/catalog/providers";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type {
  ServiceProviderBundle,
  ServiceRuntimeBundle,
  ServiceToolBundle,
} from "./bundle-types.js";

export type ServiceRuntimeBundleInput = {
  readonly providers: ServiceProviderBundle;
  readonly tools: ServiceToolBundle;
};

/**
 * Build the runtime executor side from the provider and tool bundles.
 *
 * Tests may inject a prepared AgentRuntime; otherwise the validated provider
 * and tool registries become the runtime providers and tools. The runtime
 * receives executables only, never turn profiles.
 */
export const createServiceRuntimeBundle = (
  options: ServiceCompositionOptions,
  input: ServiceRuntimeBundleInput,
): ServiceRuntimeBundle => {
  if (options.agentRuntime) {
    return { runtime: options.agentRuntime };
  }

  const runtimeConfig = options.runtime ?? { provider: PROVIDERS.FAKE.KIND };
  return {
    runtime: createAgentRuntime({
      executors: runtimeConfig.executors,
      providers: input.providers.runtimeProviders,
      tools: input.tools.runtimeTools,
    }),
  };
};
