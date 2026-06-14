import {
  recallAllowedMemoryCandidates,
  retrieveAllowedRagCandidates,
  runAllowedResearchAgent,
} from "@side-chat/partner-ai-core";
import { optionalField } from "@side-chat/shared";
import { Effect } from "effect";
import type {
  GatheredTurnContext,
  PrepareTurnContextInput,
  ServiceContextManagerOptions,
} from "../service-context-manager-types.js";

export const gatherAllowedTurnContext = (
  ports: ServiceContextManagerOptions,
  input: PrepareTurnContextInput,
) =>
  Effect.gen(function* () {
    // At this boundary, service RAG, memory, and research ports become gathered
    // turn context. Their failures remain pre-start before private context
    // reaches runtime messages or browser-visible protocol events.
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
      ragCandidates,
      memoryRecords,
      researchCandidates: researchContext.candidates,
      workflowArtifacts: researchContext.workflowArtifacts,
    } satisfies GatheredTurnContext;
  });
