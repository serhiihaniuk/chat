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
  RepositoryCommandResult,
  ToolInvocationRecord,
  UsageRecord,
} from "../schema-contract/index.js";
import { DbRepositoryError } from "./errors.js";

export type MemoryStore = {
  readonly conversations: ConversationRecord[];
  readonly messages: MessageRecord[];
  readonly assistantTurns: AssistantTurnRecord[];
  readonly contextSnapshots: ContextSnapshotRecord[];
  readonly usageRecords: UsageRecord[];
  readonly toolInvocations: ToolInvocationRecord[];
  readonly hostCommandResults: HostCommandResultRecord[];
  readonly auditEvents: AuditEventRecord[];
};

export const createMemoryStore = (): MemoryStore => ({
  conversations: [],
  messages: [],
  assistantTurns: [],
  contextSnapshots: [],
  usageRecords: [],
  toolInvocations: [],
  hostCommandResults: [],
  auditEvents: [],
});

export const result = <RecordType>(
  record: RecordType,
  inserted: boolean,
): RepositoryCommandResult<RecordType> => ({ record, inserted });

export const createIdGenerator = (prefix: string) => {
  let index = 0;
  return {
    next: (kind: string): string => {
      index += 1;
      return `${prefix}_${kind}_${index.toString().padStart(4, "0")}`;
    },
  };
};

export const replaceConversation = (
  store: MemoryStore,
  conversation: ConversationRecord,
): void => {
  const index = store.conversations.findIndex(
    (candidate) =>
      candidate.workspaceId === conversation.workspaceId &&
      candidate.conversationId === conversation.conversationId,
  );
  if (index >= 0) store.conversations[index] = conversation;
};

export const updateTurn = (
  command:
    | CompleteAssistantTurnCommand
    | FailAssistantTurnCommand
    | RecordUsageCommand,
  store: MemoryStore,
  patch: Partial<AssistantTurnRecord>,
): AssistantTurnRecord => {
  const index = store.assistantTurns.findIndex(
    (turn) =>
      turn.workspaceId === command.workspaceId &&
      turn.assistantTurnId === command.assistantTurnId,
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
