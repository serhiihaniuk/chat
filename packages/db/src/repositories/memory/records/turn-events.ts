import {
  isTurnEventTerminalType,
  type AppendTurnEventCommand,
  type AssistantTurnRepositoryContract,
  type TurnEventRecord,
} from "#schema-contract";
import type { MemoryRepositoryContext } from "./conversations.js";
import {
  requireMemoryWorkspaceTurn,
  type MemoryStore,
} from "../store/store.js";
import { DbRepositoryError } from "../../errors.js";
import { jsonValueEquals, result } from "../../repository-utils.js";

export const appendMemoryTurnEvent =
  ({
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["appendTurnEvent"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(
      store,
      command.workspaceId,
      command.assistantTurnId,
    );

    const existing = store.turnEvents.find(
      (event) =>
        event.assistantTurnId === command.assistantTurnId &&
        event.sequence === command.sequence,
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

export const readMemoryTurnEventsAfter =
  ({
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["readTurnEventsAfter"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(
      store,
      command.workspaceId,
      command.assistantTurnId,
    );
    return store.turnEvents
      .filter(
        (event) =>
          event.assistantTurnId === command.assistantTurnId &&
          event.sequence > command.after,
      )
      .sort((left, right) => left.sequence - right.sequence);
  };

export const maxMemoryTurnEventSequence =
  ({
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["maxTurnEventSequence"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(
      store,
      command.workspaceId,
      command.assistantTurnId,
    );
    const sequences = store.turnEvents
      .filter((event) => event.assistantTurnId === command.assistantTurnId)
      .map((event) => event.sequence);
    return sequences.length === 0 ? undefined : Math.max(...sequences);
  };

export const minMemoryTurnEventSequence =
  ({
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["minTurnEventSequence"] =>
  async (command) => {
    await Promise.resolve();
    requireMemoryWorkspaceTurn(
      store,
      command.workspaceId,
      command.assistantTurnId,
    );
    const sequences = store.turnEvents
      .filter((event) => event.assistantTurnId === command.assistantTurnId)
      .map((event) => event.sequence);
    return sequences.length === 0 ? undefined : Math.min(...sequences);
  };

/**
 * Mirror the postgres turn_events retention sweep for the memory adapter.
 *
 * Deletes the event rows of terminal turns (status no longer `running`) completed
 * before the cutoff, keeping the turn record and assistant message, and bounds one
 * pass to `limit` turns so behavior matches the durable adapter for the shared
 * contract test.
 */
export const pruneMemoryTurnEvents =
  ({
    store,
  }: MemoryRepositoryContext): AssistantTurnRepositoryContract["pruneTurnEventsBefore"] =>
  async (command) => {
    await Promise.resolve();
    const prunableIds = prunableTurnIds(
      store,
      command.completedBefore,
      command.limit,
    );
    if (prunableIds.size === 0) return { prunedTurns: 0, deletedEvents: 0 };

    let deletedEvents = 0;
    for (let index = store.turnEvents.length - 1; index >= 0; index -= 1) {
      if (prunableIds.has(store.turnEvents[index]!.assistantTurnId)) {
        store.turnEvents.splice(index, 1);
        deletedEvents += 1;
      }
    }
    return { prunedTurns: prunableIds.size, deletedEvents };
  };

const prunableTurnIds = (
  store: MemoryStore,
  completedBefore: string,
  limit: number,
): Set<string> =>
  new Set(
    store.assistantTurns
      .filter(
        (turn) =>
          turn.status !== "running" &&
          turn.completedAt !== undefined &&
          new Date(turn.completedAt).getTime() <
            new Date(completedBefore).getTime(),
      )
      .slice(0, limit)
      .map((turn) => turn.assistantTurnId),
  );

/**
 * Mirror the partial-unique-terminal index for the memory adapter.
 *
 * Keeps the one-terminal invariant identical across adapters so the shared
 * contract test holds. A matching terminal at the same sequence is handled by
 * the idempotent re-append path before this runs.
 */
const rejectMemorySecondTerminal = (
  store: MemoryStore,
  command: AppendTurnEventCommand,
): void => {
  if (!isTurnEventTerminalType(command.type)) return;
  const hasTerminal = store.turnEvents.some(
    (event) =>
      event.assistantTurnId === command.assistantTurnId &&
      isTurnEventTerminalType(event.type),
  );
  if (hasTerminal) {
    throw new DbRepositoryError(
      "event_log_conflict",
      "A terminal turn event already exists for this turn.",
    );
  }
};
