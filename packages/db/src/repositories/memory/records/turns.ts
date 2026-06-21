import {
  isTurnEventTerminalType,
  type AppendTurnEventCommand,
  type AssistantTurnRecord,
  type AssistantTurnRepositoryContract,
  type ContextSnapshotRecord,
  type TurnEventRecord,
} from "#schema-contract";
import { omitUndefinedProperties } from "@side-chat/shared";
import { requireSubjectConversation, type MemoryRepositoryContext } from "./conversations.js";
import { requireMemoryWorkspaceTurn, type MemoryStore, updateTurn } from "../store/store.js";
import { DbRepositoryError } from "../../errors.js";
import { jsonValueEquals, result } from "../../repository-utils.js";

export const createMemoryAssistantTurnRepository = ({
  ids,
  store,
}: MemoryRepositoryContext): Pick<
  AssistantTurnRepositoryContract,
  | "startAssistantTurn"
  | "recordTurnContextSnapshot"
  | "completeAssistantTurn"
  | "failAssistantTurn"
  | "appendTurnEvent"
  | "readTurnEventsAfter"
  | "maxTurnEventSequence"
  | "findAssistantTurn"
  | "findAssistantTurnByRequest"
  | "findActiveAssistantTurn"
> => ({
  startAssistantTurn: startMemoryAssistantTurn({ ids, store }),
  recordTurnContextSnapshot: recordMemoryTurnContextSnapshot({ ids, store }),
  completeAssistantTurn: completeMemoryAssistantTurn({ ids, store }),
  failAssistantTurn: failMemoryAssistantTurn({ ids, store }),
  appendTurnEvent: appendMemoryTurnEvent({ ids, store }),
  readTurnEventsAfter: readMemoryTurnEventsAfter({ ids, store }),
  maxTurnEventSequence: maxMemoryTurnEventSequence({ ids, store }),
  findAssistantTurn: findMemoryAssistantTurn({ store }),
  findAssistantTurnByRequest: findMemoryAssistantTurnByRequest({ store }),
  findActiveAssistantTurn: findMemoryActiveAssistantTurn({ store }),
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

const appendMemoryTurnEvent =
  ({ store }: MemoryRepositoryContext): AssistantTurnRepositoryContract["appendTurnEvent"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(store, command.workspaceId, command.assistantTurnId);

    const existing = store.turnEvents.find(
      (event) =>
        event.assistantTurnId === command.assistantTurnId && event.sequence === command.sequence,
    );
    if (existing) {
      // Idempotent re-append matches; a different payload at the same sequence is
      // durable-log corruption and must fail loudly.
      if (
        existing.type !== command.type ||
        !jsonValueEquals(existing.payloadJson, command.payloadJson)
      ) {
        throw new DbRepositoryError(
          "event_log_conflict",
          "A different turn event already exists at this sequence.",
        );
      }
      return result(existing, false);
    }

    rejectMemorySecondTerminal(store, command);

    const event: TurnEventRecord = {
      assistantTurnId: command.assistantTurnId,
      sequence: command.sequence,
      type: command.type,
      payloadJson: command.payloadJson,
      createdAt: command.now,
    };
    store.turnEvents.push(event);
    return result(event, true);
  };

const readMemoryTurnEventsAfter =
  ({ store }: MemoryRepositoryContext): AssistantTurnRepositoryContract["readTurnEventsAfter"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(store, command.workspaceId, command.assistantTurnId);
    return store.turnEvents
      .filter(
        (event) =>
          event.assistantTurnId === command.assistantTurnId && event.sequence > command.after,
      )
      .sort((left, right) => left.sequence - right.sequence);
  };

const maxMemoryTurnEventSequence =
  ({ store }: MemoryRepositoryContext): AssistantTurnRepositoryContract["maxTurnEventSequence"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(store, command.workspaceId, command.assistantTurnId);
    const sequences = store.turnEvents
      .filter((event) => event.assistantTurnId === command.assistantTurnId)
      .map((event) => event.sequence);
    return sequences.length === 0 ? undefined : Math.max(...sequences);
  };

type MemoryStoreContext = Pick<MemoryRepositoryContext, "store">;

const findMemoryAssistantTurn =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["findAssistantTurn"] =>
  async (command) => {
    await Promise.resolve();
    return store.assistantTurns.find(
      (turn) =>
        turn.workspaceId === command.workspaceId &&
        turn.assistantTurnId === command.assistantTurnId,
    );
  };

const findMemoryAssistantTurnByRequest =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["findAssistantTurnByRequest"] =>
  async (command) => {
    await Promise.resolve();
    return store.assistantTurns.find(
      (turn) => turn.workspaceId === command.workspaceId && turn.requestId === command.requestId,
    );
  };

const findMemoryActiveAssistantTurn =
  ({ store }: MemoryStoreContext): AssistantTurnRepositoryContract["findActiveAssistantTurn"] =>
  async (command) => {
    await Promise.resolve();
    // Latest started running turn mirrors the postgres ordering, so a conversation
    // with a single in-flight turn resolves the same across adapters.
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

/**
 * Mirror the partial-unique-terminal index for the memory adapter.
 *
 * Keeps the one-terminal invariant identical across adapters so the shared
 * contract test holds. A matching terminal at the same sequence is handled by
 * the idempotent re-append path before this runs.
 */
const rejectMemorySecondTerminal = (store: MemoryStore, command: AppendTurnEventCommand): void => {
  if (!isTurnEventTerminalType(command.type)) return;
  const hasTerminal = store.turnEvents.some(
    (event) =>
      event.assistantTurnId === command.assistantTurnId && isTurnEventTerminalType(event.type),
  );
  if (hasTerminal) {
    throw new DbRepositoryError(
      "event_log_conflict",
      "A terminal turn event already exists for this turn.",
    );
  }
};
