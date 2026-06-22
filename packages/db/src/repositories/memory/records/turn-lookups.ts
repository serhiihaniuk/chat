import type { AssistantTurnRepositoryContract } from "#schema-contract";
import type { MemoryStore } from "../store/store.js";

type MemoryStoreContext = { readonly store: MemoryStore };

/** Read one turn by id, scoped to the workspace; `undefined` when none matches. */
export const findMemoryAssistantTurn =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["findAssistantTurn"] =>
  async (command) => {
    await Promise.resolve();
    return store.assistantTurns.find(
      (turn) =>
        turn.workspaceId === command.workspaceId &&
        turn.assistantTurnId === command.assistantTurnId,
    );
  };

/** Resolve one turn from a client request id, scoped to the workspace. */
export const findMemoryAssistantTurnByRequest =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["findAssistantTurnByRequest"] =>
  async (command) => {
    await Promise.resolve();
    return store.assistantTurns.find(
      (turn) => turn.workspaceId === command.workspaceId && turn.requestId === command.requestId,
    );
  };

/**
 * Read the running turn for one conversation, if any.
 *
 * Latest started running turn mirrors the postgres ordering, so a conversation
 * with a single in-flight turn resolves the same across adapters.
 */
export const findMemoryActiveAssistantTurn =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["findActiveAssistantTurn"] =>
  async (command) => {
    await Promise.resolve();
    return store.assistantTurns
      .filter(
        (turn) =>
          turn.workspaceId === command.workspaceId &&
          turn.subjectId === command.subjectId &&
          turn.conversationId === command.conversationId &&
          turn.status === "running",
      )
      .sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1))[0];
  };

/** Every running turn for a subject across conversations (activity snapshot). */
export const listMemoryActiveAssistantTurns =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["listActiveAssistantTurns"] =>
  async (command) => {
    await Promise.resolve();
    return store.assistantTurns
      .filter(
        (turn) =>
          turn.workspaceId === command.workspaceId &&
          turn.subjectId === command.subjectId &&
          turn.status === "running",
      )
      .sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1));
  };
