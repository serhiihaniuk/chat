import {
  type AssistantTurnRecord,
  type AssistantTurnRepositoryContract,
  type ContextSnapshotRecord,
} from "#schema-contract";
import { omitUndefinedProperties } from "@side-chat/shared";
import { requireSubjectConversation, type MemoryRepositoryContext } from "./conversations.js";
import {
  findMemoryActiveAssistantTurn,
  findMemoryAssistantTurn,
  findMemoryAssistantTurnByRequest,
  listMemoryActiveAssistantTurns,
} from "./turn-lookups.js";
import { updateTurn } from "../store/store.js";
import { result } from "../../repository-utils.js";

export const createMemoryAssistantTurnRepository = ({
  ids,
  store,
}: MemoryRepositoryContext): Pick<
  AssistantTurnRepositoryContract,
  | "startAssistantTurn"
  | "recordTurnContextSnapshot"
  | "completeAssistantTurn"
  | "failAssistantTurn"
  | "requestTurnCancellation"
  | "findAssistantTurn"
  | "findAssistantTurnByRequest"
  | "findActiveAssistantTurn"
  | "listActiveAssistantTurns"
> => ({
  startAssistantTurn: startMemoryAssistantTurn({ ids, store }),
  recordTurnContextSnapshot: recordMemoryTurnContextSnapshot({ ids, store }),
  completeAssistantTurn: completeMemoryAssistantTurn({ ids, store }),
  failAssistantTurn: failMemoryAssistantTurn({ ids, store }),
  requestTurnCancellation: requestMemoryTurnCancellation({ ids, store }),
  findAssistantTurn: findMemoryAssistantTurn({ store }),
  findAssistantTurnByRequest: findMemoryAssistantTurnByRequest({ store }),
  findActiveAssistantTurn: findMemoryActiveAssistantTurn({ store }),
  listActiveAssistantTurns: listMemoryActiveAssistantTurns({ store }),
});

const startMemoryAssistantTurn =
  ({
    ids,
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["startAssistantTurn"] =>
  async (command) => {
    await Promise.resolve();
    requireSubjectConversation(
      store,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const existing = store.assistantTurns.find(
      (turn) => turn.workspaceId === command.workspaceId && turn.requestId === command.requestId,
    );
    if (existing) return result(existing, false);

    const turn: AssistantTurnRecord = {
      workspaceId: command.workspaceId,
      assistantTurnId: ids.next("assistant_turn"),
      requestId: command.requestId,
      conversationId: command.conversationId,
      subjectId: command.subjectId,
      actorId: command.actorId,
      userMessageId: command.userMessageId,
      runtimeProfile: command.runtimeProfile,
      systemPromptVersion: command.systemPromptVersion,
      contextStrategyVersion: command.contextStrategyVersion,
      toolRegistryVersion: command.toolRegistryVersion,
      modelProvider: command.modelProvider,
      modelId: command.modelId,
      status: "running",
      leaseEpoch: 0,
      startedAt: command.now,
      createdAt: command.now,
      updatedAt: command.now,
    };
    store.assistantTurns.push(turn);
    return result(turn, true);
  };

const recordMemoryTurnContextSnapshot =
  ({
    ids,
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["recordTurnContextSnapshot"] =>
  async (command) => {
    await Promise.resolve();
    const existing = store.contextSnapshots.find(
      (snapshot) =>
        snapshot.workspaceId === command.workspaceId &&
        snapshot.assistantTurnId === command.assistantTurnId,
    );
    if (existing) return result(existing, false);

    const snapshot: ContextSnapshotRecord = omitUndefinedProperties({
      workspaceId: command.workspaceId,
      contextSnapshotId: ids.next("context_snapshot"),
      assistantTurnId: command.assistantTurnId,
      contextSchemaVersion: command.contextSchemaVersion,
      hostSurfaceId: command.hostSurfaceId,
      hostContextHash: command.hostContextHash,
      capabilitiesHash: command.capabilitiesHash,
      contextRedactedJson: command.contextRedactedJson,
      createdAt: command.now,
      updatedAt: command.now,
    });
    store.contextSnapshots.push(snapshot);
    return result(snapshot, true);
  };

const completeMemoryAssistantTurn =
  ({ store }: MemoryRepositoryContext): AssistantTurnRepositoryContract["completeAssistantTurn"] =>
  (command) =>
    Promise.resolve().then(() =>
      updateTurn(command, store, {
        status: "completed",
        assistantMessageId: command.assistantMessageId,
        finishReason: command.finishReason,
        completedAt: command.now,
      }),
    );

const failMemoryAssistantTurn =
  ({ store }: MemoryRepositoryContext): AssistantTurnRepositoryContract["failAssistantTurn"] =>
  (command) =>
    Promise.resolve().then(() =>
      updateTurn(command, store, {
        status: command.status,
        errorCode: command.errorCode,
        completedAt: command.now,
      }),
    );

/**
 * Mirror the postgres cancel-intent CAS for the memory adapter.
 *
 * Only a running turn in the same workspace transitions; an unknown,
 * cross-workspace, or already-terminal turn is a durable no-op so the shared
 * contract test holds. Memory has no `pg_notify`, so the in-process runner is
 * interrupted directly by the cancel route instead of through a listener.
 */
const requestMemoryTurnCancellation =
  ({
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["requestTurnCancellation"] =>
  async (command) => {
    await Promise.resolve();
    const turn = store.assistantTurns.find(
      (candidate) =>
        candidate.workspaceId === command.workspaceId &&
        candidate.assistantTurnId === command.assistantTurnId,
    );
    if (!turn || turn.status !== "running") return { cancelRequested: false };

    const index = store.assistantTurns.indexOf(turn);
    store.assistantTurns[index] = {
      ...turn,
      cancelRequestedAt: command.now,
      updatedAt: command.now,
    };
    return { cancelRequested: true };
  };
