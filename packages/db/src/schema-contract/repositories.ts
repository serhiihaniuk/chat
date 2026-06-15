import type { JsonObject } from "@side-chat/shared";
import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ContextSnapshotRecord,
  ConversationRecord,
  HostCommandResultRecord,
  MessageRecord,
  ToolInvocationRecord,
  UsageRecord,
} from "./entities.js";

export type IdempotencyKey = {
  readonly value: string;
};

export type RepositoryCommandEnvelope = {
  readonly workspaceId: string;
  readonly now: string;
};

export type CreateOrGetConversationCommand = RepositoryCommandEnvelope & {
  readonly conversationId?: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly conversationKey: string;
};

export type AppendMessageCommand = RepositoryCommandEnvelope & {
  readonly conversationId: string;
  readonly subjectId: string;
  readonly role: MessageRecord["role"];
  readonly contentText: string;
  readonly metadataJson: JsonObject;
  readonly idempotencyKey: IdempotencyKey;
};

export type StartAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly subjectId: string;
  readonly actorId: string;
  readonly requestId: string;
  readonly conversationId: string;
  readonly userMessageId: string;
  readonly runtimeProfile: string;
  readonly systemPromptVersion: string;
  readonly contextStrategyVersion: string;
  readonly toolRegistryVersion: string;
  readonly modelProvider: string;
  readonly modelId: string;
};

export type RecordTurnContextSnapshotCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly contextSchemaVersion: string;
  readonly hostSurfaceId?: string;
  readonly hostContextHash: string;
  readonly capabilitiesHash: string;
  readonly contextRedactedJson: JsonObject;
};

export type CompleteAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly assistantMessageId: string;
  readonly finishReason: string;
};

export type FailAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly status: AssistantTurnRecord["status"];
  readonly errorCode: string;
};

export type RecordUsageCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly runtimeStepIndex: number;
  readonly modelProvider: string;
  readonly modelId: string;
  readonly providerRequestId?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly costUnits: string;
};

export type ReadUsageSummaryCommand = {
  readonly workspaceId: string;
};

export type UsageSummary = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export type RecordToolInvocationCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly runtimeStepIndex: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: ToolInvocationRecord["status"];
  readonly inputHash: string;
  readonly outputHash?: string;
  readonly inputRedactedJson: JsonObject;
  readonly outputRedactedJson?: JsonObject;
  readonly errorCode?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
};

export type RecordHostCommandResultCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: string;
  readonly commandId: string;
  readonly commandType: string;
  readonly resourceId?: string;
  readonly status: HostCommandResultRecord["status"];
  readonly resultCode: string;
  readonly commandRedactedJson: JsonObject;
  readonly resultRedactedJson?: JsonObject;
  readonly resolvedAt?: string;
};

export type ReadConversationHistoryCommand = {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly limit: number;
  readonly afterSequenceIndex?: number;
  readonly beforeSequenceIndex?: number;
};

export type ResetConversationCommand = RepositoryCommandEnvelope & {
  readonly subjectId: string;
  readonly actorId: string;
  readonly conversationId: string;
  readonly requestId: string;
};

export type AppendAuditEventCommand = RepositoryCommandEnvelope & {
  readonly subjectId: string;
  readonly actorId: string;
  readonly eventType: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly requestId: string;
  readonly metadataJson: JsonObject;
};

export type RepositoryCommandInput =
  | CreateOrGetConversationCommand
  | AppendMessageCommand
  | StartAssistantTurnCommand
  | RecordTurnContextSnapshotCommand
  | CompleteAssistantTurnCommand
  | FailAssistantTurnCommand
  | RecordUsageCommand
  | ReadUsageSummaryCommand
  | RecordToolInvocationCommand
  | RecordHostCommandResultCommand
  | ReadConversationHistoryCommand
  | ResetConversationCommand
  | AppendAuditEventCommand;

export type RepositoryCommandResult<RecordType> = {
  readonly record: RecordType;
  readonly inserted: boolean;
};

export type ConversationRepositoryContract = {
  readonly createOrGetConversation: (
    command: CreateOrGetConversationCommand,
  ) => Promise<RepositoryCommandResult<ConversationRecord>>;
  readonly appendMessage: (
    command: AppendMessageCommand,
  ) => Promise<RepositoryCommandResult<MessageRecord>>;
  readonly readConversationHistory: (
    command: ReadConversationHistoryCommand,
  ) => Promise<readonly MessageRecord[]>;
  readonly resetConversation: (command: ResetConversationCommand) => Promise<ConversationRecord>;
};

export type AssistantTurnRepositoryContract = {
  readonly startAssistantTurn: (
    command: StartAssistantTurnCommand,
  ) => Promise<RepositoryCommandResult<AssistantTurnRecord>>;
  readonly recordTurnContextSnapshot: (
    command: RecordTurnContextSnapshotCommand,
  ) => Promise<RepositoryCommandResult<ContextSnapshotRecord>>;
  readonly completeAssistantTurn: (
    command: CompleteAssistantTurnCommand,
  ) => Promise<AssistantTurnRecord>;
  readonly failAssistantTurn: (command: FailAssistantTurnCommand) => Promise<AssistantTurnRecord>;
  readonly recordUsage: (
    command: RecordUsageCommand,
  ) => Promise<RepositoryCommandResult<UsageRecord>>;
  readonly readUsageSummary: (command: ReadUsageSummaryCommand) => Promise<UsageSummary>;
};

export type InteractionRepositoryContract = {
  readonly recordToolInvocation: (
    command: RecordToolInvocationCommand,
  ) => Promise<RepositoryCommandResult<ToolInvocationRecord>>;
  readonly recordHostCommandResult: (
    command: RecordHostCommandResultCommand,
  ) => Promise<RepositoryCommandResult<HostCommandResultRecord>>;
  readonly appendAuditEvent: (
    command: AppendAuditEventCommand,
  ) => Promise<RepositoryCommandResult<AuditEventRecord>>;
};
