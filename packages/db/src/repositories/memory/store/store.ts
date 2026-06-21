import type {
  AssistantTurnRecord,
  AuditEventRecord,
  CompleteAssistantTurnCommand,
  ContextSnapshotRecord,
  ConversationRecord,
  FailAssistantTurnCommand,
  HostCommandResultRecord,
  MessageRecord,
  RecordUsageCommand,
  ToolInvocationRecord,
  TurnEventRecord,
  UsageRecord,
} from "#schema-contract";
import { DbRepositoryError } from "../../errors.js";

export type MemoryStore = {
  readonly conversations: ConversationRecord[];
  readonly messages: MessageRecord[];
  readonly assistantTurns: AssistantTurnRecord[];
  readonly turnEvents: TurnEventRecord[];
  readonly contextSnapshots: ContextSnapshotRecord[];
  readonly usageRecords: UsageRecord[];
  readonly toolInvocations: ToolInvocationRecord[];
  readonly hostCommandResults: HostCommandResultRecord[];
  readonly auditEvents: AuditEventRecord[];
};

export type MemoryStoreSnapshot = {
  readonly conversations: readonly ConversationRecord[];
  readonly messages: readonly MessageRecord[];
  readonly assistantTurns: readonly AssistantTurnRecord[];
  readonly turnEvents: readonly TurnEventRecord[];
  readonly contextSnapshots: readonly ContextSnapshotRecord[];
  readonly usageRecords: readonly UsageRecord[];
  readonly toolInvocations: readonly ToolInvocationRecord[];
  readonly hostCommandResults: readonly HostCommandResultRecord[];
  readonly auditEvents: readonly AuditEventRecord[];
};

export const createMemoryStore = (): MemoryStore => ({
  conversations: [],
  messages: [],
  assistantTurns: [],
  turnEvents: [],
  contextSnapshots: [],
  usageRecords: [],
  toolInvocations: [],
  hostCommandResults: [],
  auditEvents: [],
});

export const snapshotMemoryStore = (store: MemoryStore): MemoryStoreSnapshot => ({
  conversations: [...store.conversations],
  messages: [...store.messages],
  assistantTurns: [...store.assistantTurns],
  turnEvents: [...store.turnEvents],
  contextSnapshots: [...store.contextSnapshots],
  usageRecords: [...store.usageRecords],
  toolInvocations: [...store.toolInvocations],
  hostCommandResults: [...store.hostCommandResults],
  auditEvents: [...store.auditEvents],
});

export const replaceConversation = (store: MemoryStore, conversation: ConversationRecord): void => {
  const index = store.conversations.findIndex(
    (candidate) =>
      candidate.workspaceId === conversation.workspaceId &&
      candidate.conversationId === conversation.conversationId,
  );
  if (index >= 0) store.conversations[index] = conversation;
};

export const updateTurn = (
  command: CompleteAssistantTurnCommand | FailAssistantTurnCommand | RecordUsageCommand,
  store: MemoryStore,
  patch: Partial<AssistantTurnRecord>,
): AssistantTurnRecord => {
  const index = store.assistantTurns.findIndex(
    (turn) =>
      turn.workspaceId === command.workspaceId && turn.assistantTurnId === command.assistantTurnId,
  );
  if (index < 0) {
    throw new DbRepositoryError(
      "record_not_found",
      "Assistant turn does not exist in the requested workspace.",
    );
  }
  const current = store.assistantTurns[index]!;
  if (current.status !== "running") {
    throw new DbRepositoryError(
      "invalid_transition",
      "Only running assistant turns can be completed or failed.",
    );
  }
  const next = { ...current, ...patch, updatedAt: command.now };
  store.assistantTurns[index] = next;
  return next;
};

export const upsertAt = <RecordType>(
  records: RecordType[],
  index: number,
  record: RecordType,
): void => {
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
};

/**
 * Prove a turn belongs to the workspace before its event log is touched.
 *
 * Mirrors the postgres `requireWorkspaceTurn` gate: turn-event rows are scoped
 * only through their turn, so a turn id from another workspace fails closed.
 */
export const requireMemoryWorkspaceTurn = (
  store: MemoryStore,
  workspaceId: string,
  assistantTurnId: string,
): AssistantTurnRecord => {
  const turn = store.assistantTurns.find(
    (candidate) =>
      candidate.workspaceId === workspaceId && candidate.assistantTurnId === assistantTurnId,
  );
  if (!turn) {
    throw new DbRepositoryError(
      "record_not_found",
      "Assistant turn does not exist in the requested workspace.",
    );
  }
  return turn;
};
