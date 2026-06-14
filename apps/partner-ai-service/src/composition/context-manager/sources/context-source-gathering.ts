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
    // Gather all private context before runtime starts. If any source fails,
    // the turn stops before model messages or browser events are produced.
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
      researchArtifacts: researchContext.researchArtifacts,
    } satisfies GatheredTurnContext;
  });
