import type { RagRetrieverPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";

// Local/test fallback used when no retriever is injected. It returns no RAG
// context and should not stand in for production retrieval behavior.
export const createNoopRagRetriever = (): RagRetrieverPort => ({
  retrieve: () => Effect.succeed([]),
});
