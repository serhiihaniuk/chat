import { Effect } from "effect";
import type { ResearchAgentPort } from "@side-chat/partner-ai-core";

// Local/test fallback used when no research adapter is injected. It deliberately
// returns no context and should not stand in for production research behavior.
export const createNoopResearchAgent = (): ResearchAgentPort => ({
  runResearch: () => Effect.succeed({ summary: "", sources: [] }),
});
