import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type ContextCandidate,
} from "@side-chat/partner-ai-core";
import { createHostContextCandidates } from "../../context-candidates/service-host-context.js";
import { toMemoryContextCandidate } from "../../context-candidates/service-memory-context.js";
import { toRagContextCandidate } from "../../context-candidates/service-rag-context.js";
import { createToolContextCandidate } from "../../context-candidates/service-tool-context.js";
import type {
  GatheredTurnContext,
  PrepareTurnContextInput,
} from "../service-context-manager-types.js";

export const createContextCandidates = (
  input: PrepareTurnContextInput,
  gatheredContext: GatheredTurnContext,
): readonly ContextCandidate[] => [
  createCurrentMessageCandidate(input),
  ...createHostContextCandidates(input.request.hostContext, input.manifest),
  ...gatheredContext.memoryRecords.map(toMemoryContextCandidate),
  ...gatheredContext.ragCandidates.map(toRagContextCandidate),
  ...gatheredContext.researchCandidates,
  ...input.policyDecision.allowedToolNames.map((toolName) =>
    createToolContextCandidate(input.manifest, toolName),
  ),
];

const createCurrentMessageCandidate = (input: PrepareTurnContextInput): ContextCandidate => ({
  candidateId: `message_${input.request.message.id}`,
  sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE,
  sourceId: input.request.message.id,
  trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
  redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
  content: input.request.message.content,
  estimatedTokens: estimateTokens(input.request.message.content),
  priority: 100,
  provenance: {
    sourceId: input.request.message.id,
    label: "Current user message",
  },
});

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
