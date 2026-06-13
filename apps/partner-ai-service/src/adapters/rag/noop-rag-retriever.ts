import type { RagRetrieverPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";

export const createNoopRagRetriever = (): RagRetrieverPort => ({
  retrieve: () => Effect.succeed([]),
});
