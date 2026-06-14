import type { PreparedContextSection } from "@side-chat/partner-ai-core";
import { createHostContextSections } from "../../context-candidates/service-host-context.js";
import { createMemoryContextSections } from "../../context-candidates/service-memory-context.js";
import { createRagContextSections } from "../../context-candidates/service-rag-context.js";
import { createResearchContextSections } from "../../context-candidates/service-research-context.js";
import { createAllowedToolSections } from "../../context-candidates/service-tool-context.js";
import type {
  GatheredTurnContext,
  PrepareTurnContextInput,
} from "../service-context-manager-types.js";

export const createPreparedContextSections = (
  input: PrepareTurnContextInput,
  gatheredContext: GatheredTurnContext,
): readonly PreparedContextSection[] => [
  ...createHostContextSections(input.request.hostContext),
  ...createMemoryContextSections(gatheredContext.memoryRecords),
  ...createRagContextSections(gatheredContext.ragCandidates),
  ...createResearchContextSections(
    gatheredContext.researchCandidates,
    gatheredContext.workflowArtifacts,
  ),
  ...createAllowedToolSections(input.manifest, input.policyDecision.allowedToolNames),
];
