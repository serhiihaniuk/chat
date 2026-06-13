import { Effect } from "effect";
import type { ResearchAgentPort } from "@side-chat/partner-ai-core";

export const createNoopResearchAgent = (): ResearchAgentPort => ({
  runResearch: () => Effect.succeed({ summary: "", sources: [] }),
});
