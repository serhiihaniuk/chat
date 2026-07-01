// Owns: the conversation history context port and the context manager that
// selects and budgets per-turn context.
// Does not own: the system prompt (turn profile bundle owns it), context trust
// labels (host context is always admitted as user-provided), or persistence.

import { createRepositoryConversationHistoryContext } from "#adapters/persistence/repository-conversation-history-context";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createServiceContextManager } from "#composition/context/context-manager/service-context-manager";
import type { SidechatRepositories } from "@side-chat/db";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceContextBundle } from "../bundle-types.js";

export type ServiceContextBundleInput = {
  readonly repositories: SidechatRepositories;
};

/**
 * Build the per-turn context manager on top of repository history.
 *
 * The context manager selects and budgets context, but it does not own the
 * system prompt. History comes from the conversation repository, and host
 * context is admitted as user-provided before model execution.
 */
export const createServiceContextBundle = (
  options: ServiceCompositionOptions,
  input: ServiceContextBundleInput,
): ServiceContextBundle => {
  const capabilityConfig = options.capabilities ?? DEFAULT_SERVICE_CAPABILITY_CONFIG;
  const historyContext = createRepositoryConversationHistoryContext(input.repositories);

  return {
    historyContext,
    contextManager: createServiceContextManager({
      historyContext,
      history: capabilityConfig.history,
      contextAdmission: capabilityConfig.contextAdmission,
    }),
  };
};
