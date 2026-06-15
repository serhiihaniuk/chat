import { HISTORY_CONTEXT_MODES } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import type {
  GatheredTurnContext,
  PrepareTurnContextInput,
  ServiceContextManagerOptions,
} from "../service-context-manager-types.js";

/**
 * Gather every policy-allowed context source before model execution.
 *
 * Conversation history is called while the turn is still pre-runtime. The
 * gathered records remain service-private until admission and runtime-message
 * rendering decide what becomes model-visible.
 */
export const gatherAllowedTurnContext = (
  ports: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
) =>
  Effect.gen(function* () {
    const historyMessages = yield* readAllowedConversationHistory(ports, input);

    return {
      historyMessages,
    } satisfies GatheredTurnContext;
  });

const readAllowedConversationHistory = (
  ports: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
) => {
  const config = ports.history ?? DEFAULT_SERVICE_CAPABILITY_CONFIG.history;
  if (config.mode !== HISTORY_CONTEXT_MODES.RECENT_MESSAGES || config.maxMessages <= 0) {
    return Effect.succeed([]);
  }

  return ports.historyContext.readConversationHistory({
    authContext: input.authContext,
    workspace: input.workspace,
    conversation: input.conversation,
    currentUserMessage: input.currentUserMessage,
    limit: config.maxMessages + 1,
    abortSignal: input.abortSignal,
  });
};
