import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  toContextCandidateId,
  toContextSourceId,
  type ContextCandidate,
} from "@side-chat/partner-ai-core";
import { createHostContextCandidates } from "../sources/service-host-context.js";
import { createToolContextCandidate } from "../sources/service-tool-context.js";
import type { PrepareTurnContextInput } from "../service-context-manager-types.js";

export const createContextCandidates = (
  input: PrepareTurnContextInput,
): readonly ContextCandidate[] => [
  createCurrentMessageCandidate(input),
  ...createHostContextCandidates(input.request.hostContext, input.manifest),
  ...input.policyDecision.allowedToolNames.map((toolName) =>
    createToolContextCandidate(input.manifest, toolName),
  ),
];

const createCurrentMessageCandidate = (input: PrepareTurnContextInput): ContextCandidate => ({
  candidateId: toContextCandidateId(`message_${input.request.message.id}`),
  sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE,
  sourceId: toContextSourceId(input.request.message.id),
  trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
  redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
  content: input.request.message.content,
  estimatedTokens: estimateTokens(input.request.message.content),
  priority: 100,
  provenance: {
    sourceId: toContextSourceId(input.request.message.id),
    label: "Current user message",
  },
});

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
