// Owns: collecting tool registrations from config (including the local mock web
// search) and building the tool registry, runtime tools, and capabilities.
// Does not own: executing tools or assembling the manifest; core decides
// per-turn exposure from the manifest, so exposure policy is hidden from here.

import { createMockWebSearchRegistration } from "#adapters/tools/mock-web-search-tool";
import {
  createServiceToolRegistry,
  type ServiceToolRegistration,
} from "#composition/tools/service-tool-registry";
import { PROVIDERS } from "#config/catalog/providers";
import type {
  RuntimeConfig,
  RuntimeToolConfig,
  ServiceCompositionOptions,
} from "../service-composition-types.js";
import type { ServiceToolBundle } from "../bundle-types.js";

/**
 * Build the tool registry from config so capability and executor share a source.
 *
 * Every tool capability and its runtime executable come from the same
 * `ServiceToolRegistration`, so a tool can never be declared to the model
 * without a matching executable behind it.
 */
export const createServiceToolBundle = (options: ServiceCompositionOptions): ServiceToolBundle => {
  const runtimeConfig = options.runtime ?? { provider: PROVIDERS.FAKE.KIND };
  const registry = createServiceToolRegistry(toolRegistrationsForConfig(runtimeConfig));

  return {
    registry,
    runtimeTools: registry.runtimeTools,
    toolCapabilities: registry.toolCapabilities,
  };
};

/**
 * Collect tool registrations from config, including the local mock web search.
 *
 * The mock fixture joins the same registry path as app-owned tools, so enabling
 * it never adds a separate manifest or runtime wiring step.
 */
const toolRegistrationsForConfig = (
  config: RuntimeConfig & RuntimeToolConfig,
): readonly ServiceToolRegistration[] => [
  ...(config.enableMockWebSearch ? [createMockWebSearchRegistration()] : []),
  ...(config.tools ?? []),
];
