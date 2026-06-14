import type { MemoryPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";

// Local/test fallback used when no memory adapter is injected. It never reads or
// writes memory, so production memory behavior must provide a real adapter.
export const createNoopMemoryPort = (): MemoryPort => ({
  recall: () => Effect.succeed([]),
  proposeWriteCandidates: () => Effect.succeed([]),
  writeCandidates: () => Effect.succeed(undefined),
});
