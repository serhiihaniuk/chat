import type {
  AssistantTurnRecord,
  AssistantTurnRepositoryContract,
  ContextSnapshotRecord,
} from "#schema-contract";
import { requireSubjectConversation, type MemoryRepositoryContext } from "./conversations.js";
import { updateTurn } from "../store/store.js";
import { result } from "../../repository-utils.js";

export const createMemoryAssistantTurnRepository = ({
  ids,
  store,
}: MemoryRepositoryContext): Pick<
  AssistantTurnRepositoryContract,
  "startAssistantTurn" | "recordTurnContextSnapshot" | "completeAssistantTurn" | "failAssistantTurn"
> => ({
  startAssistantTurn: async (command) => {
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
      startedAt: command.now,
      createdAt: command.now,
      updatedAt: command.now,
    };
    store.assistantTurns.push(turn);
    return result(turn, true);
  },
  recordTurnContextSnapshot: async (command) => {
    await Promise.resolve();
    const existing = store.contextSnapshots.find(
      (snapshot) =>
        snapshot.workspaceId === command.workspaceId &&
        snapshot.assistantTurnId === command.assistantTurnId,
    );
    if (existing) return result(existing, false);

    const snapshot: ContextSnapshotRecord = {
      workspaceId: command.workspaceId,
      contextSnapshotId: ids.next("context_snapshot"),
      assistantTurnId: command.assistantTurnId,
      contextSchemaVersion: command.contextSchemaVersion,
      ...(command.hostSurfaceId ? { hostSurfaceId: command.hostSurfaceId } : {}),
      hostContextHash: command.hostContextHash,
      capabilitiesHash: command.capabilitiesHash,
      contextRedactedJson: command.contextRedactedJson,
      createdAt: command.now,
      updatedAt: command.now,
    };
    store.contextSnapshots.push(snapshot);
    return result(snapshot, true);
  },
  completeAssistantTurn: (command) =>
    Promise.resolve().then(() =>
      updateTurn(command, store, {
        status: "completed",
        assistantMessageId: command.assistantMessageId,
        finishReason: command.finishReason,
        completedAt: command.now,
      }),
    ),
  failAssistantTurn: (command) =>
    Promise.resolve().then(() =>
      updateTurn(command, store, {
        status: command.status,
        errorCode: command.errorCode,
        completedAt: command.now,
      }),
    ),
});
