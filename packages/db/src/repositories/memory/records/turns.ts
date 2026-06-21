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
import {
  findMemoryActiveAssistantTurn,
  findMemoryAssistantTurn,
  findMemoryAssistantTurnByRequest,
} from "./turn-lookups.js";
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
  | "requestTurnCancellation"
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
  requestTurnCancellation: requestMemoryTurnCancellation({ ids, store }),
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
