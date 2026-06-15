import {
  HISTORY_CONTEXT_MODES,
  recallAllowedMemoryCandidates,
  retrieveAllowedRagCandidates,
  runAllowedResearchAgent,
} from "@side-chat/partner-ai-core";
import { optionalField } from "@side-chat/shared";
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
 * Conversation history, RAG, memory, and research adapters are called while the
 * turn is still pre-runtime. The gathered records remain service-private until
 * candidate creation and rendering decide which safe text and metadata join the
 * prepared context board.
 */
export const gatherAllowedTurnContext = (
  ports: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
) =>
  Effect.gen(function* () {
    // Gather all private context before runtime starts. If any source fails,
    // the turn stops before model messages or browser events are produced.
    const historyMessages = yield* readAllowedConversationHistory(ports, input);
    const ragCandidates = yield* retrieveAllowedRagCandidates({
      retriever: ports.ragRetriever,
      authContext: input.authContext,
      workspace: input.workspace,
      request: input.request,
      policyDecision: input.policyDecision,
      ...optionalField("abortSignal", input.abortSignal),
    });
    const memoryRecords = yield* recallAllowedMemoryCandidates({
      memory: ports.memory,
      authContext: input.authContext,
      workspace: input.workspace,
      conversation: input.conversation,
      request: input.request,
      policyDecision: input.policyDecision,
      ...optionalField("abortSignal", input.abortSignal),
    });
    const researchContext = yield* runAllowedResearchAgent({
      researchAgent: ports.researchAgent,
      authContext: input.authContext,
      workspace: input.workspace,
      request: input.request,
      policyDecision: input.policyDecision,
      now: input.now,
      ...optionalField("abortSignal", input.abortSignal),
    });

    return {
      historyMessages,
      ragCandidates,
      memoryRecords,
      researchCandidates: researchContext.candidates,
      researchArtifacts: researchContext.researchArtifacts,
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
    ...optionalField("abortSignal", input.abortSignal),
  });
};
