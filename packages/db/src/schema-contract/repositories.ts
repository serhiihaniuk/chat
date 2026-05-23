import type { JsonObject } from "@side-chat/chat-protocol";
import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ContextSnapshotRecord,
  ConversationRecord,
  HostCommandResultRecord,
  MessageRecord,
  TenantScopedRecord,
  ToolInvocationRecord,
  UsageRecord,
} from "./entities.js";

export type IdempotencyKey = {
  readonly requestId: string;
  readonly operation: string;
};

export type RepositoryCommandEnvelope = TenantScopedRecord & {
  readonly commandId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly actorUserId: string;
};

export type CreateConversationCommand = RepositoryCommandEnvelope & {
  readonly title?: string;
};

export type AppendMessageCommand = RepositoryCommandEnvelope & {
  readonly conversationId: string;
  readonly role: MessageRecord["role"];
  readonly content: string;
};

export type StartAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly modelId?: string;
};

export type SaveContextSnapshotCommand = RepositoryCommandEnvelope & {
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly payload: JsonObject;
  readonly hostOrigin?: string;
};

export type RecordUsageCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export type RecordToolInvocationCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly toolName: string;
  readonly requestPayload: JsonObject;
};

export type RecordHostCommandResultCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly commandName: string;
  readonly requestPayload: JsonObject;
};

export type WriteAuditEventCommand = RepositoryCommandEnvelope & {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata: JsonObject;
};

export type RepositoryCommandInput =
  | CreateConversationCommand
  | AppendMessageCommand
  | StartAssistantTurnCommand
  | SaveContextSnapshotCommand
  | RecordUsageCommand
  | RecordToolInvocationCommand
  | RecordHostCommandResultCommand
  | WriteAuditEventCommand;

export type RepositoryCommandResult<Record> = {
  readonly record: Record;
  readonly idempotencyKey: IdempotencyKey;
  readonly inserted: boolean;
};

export type ConversationRepositoryContract = {
  readonly createConversation: (
    command: CreateConversationCommand,
  ) => Promise<RepositoryCommandResult<ConversationRecord>>;
  readonly appendMessage: (
    command: AppendMessageCommand,
  ) => Promise<RepositoryCommandResult<MessageRecord>>;
};

export type AssistantTurnRepositoryContract = {
  readonly startAssistantTurn: (
    command: StartAssistantTurnCommand,
  ) => Promise<RepositoryCommandResult<AssistantTurnRecord>>;
  readonly saveContextSnapshot: (
    command: SaveContextSnapshotCommand,
  ) => Promise<RepositoryCommandResult<ContextSnapshotRecord>>;
  readonly recordUsage: (
    command: RecordUsageCommand,
  ) => Promise<RepositoryCommandResult<UsageRecord>>;
};

export type InteractionRepositoryContract = {
  readonly recordToolInvocation: (
    command: RecordToolInvocationCommand,
  ) => Promise<RepositoryCommandResult<ToolInvocationRecord>>;
  readonly recordHostCommandResult: (
    command: RecordHostCommandResultCommand,
  ) => Promise<RepositoryCommandResult<HostCommandResultRecord>>;
  readonly writeAuditEvent: (
    command: WriteAuditEventCommand,
  ) => Promise<RepositoryCommandResult<AuditEventRecord>>;
};
