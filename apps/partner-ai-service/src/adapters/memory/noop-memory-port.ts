import type { MemoryPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";

export const createNoopMemoryPort = (): MemoryPort => ({
  recall: () => Effect.succeed([]),
  proposeWriteCandidates: () => Effect.succeed([]),
  writeCandidates: () => Effect.succeed(undefined),
});
