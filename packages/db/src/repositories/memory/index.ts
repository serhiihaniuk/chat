import type { SidechatRepositories } from "../contract.js";
import { createMemoryStore, snapshotMemoryStore, type MemoryStoreSnapshot } from "./store.js";
import { createMemoryConversationRepository } from "./conversations.js";
import {
  appendMemoryAuditEvent,
  recordMemoryHostCommandResult,
  recordMemoryToolInvocation,
} from "./interactions.js";
import { createMemoryAssistantTurnRepository } from "./turns.js";
import { createMemoryUsageRepository } from "./usage.js";
import { createIdGenerator } from "../repository-utils.js";

export type MemorySidechatRepositories = SidechatRepositories & {
  readonly snapshot: () => MemoryStoreSnapshot;
};

export type MemoryRepositoryOptions = {
  readonly idPrefix?: string;
};

export const createMemorySidechatRepositories = (
  options: MemoryRepositoryOptions = {},
): MemorySidechatRepositories => {
  const ids = createIdGenerator(options.idPrefix ?? "mem");
  const store = createMemoryStore();
  const context = { ids, store };

  return {
    snapshot: () => snapshotMemoryStore(store),
    ...createMemoryConversationRepository(context),
    ...createMemoryAssistantTurnRepository(context),
    ...createMemoryUsageRepository(context),
    recordToolInvocation: (command) => recordMemoryToolInvocation(command, store, ids),
    recordHostCommandResult: (command) => recordMemoryHostCommandResult(command, store, ids),
    appendAuditEvent: (command) => appendMemoryAuditEvent(command, store, ids),
  };
};
