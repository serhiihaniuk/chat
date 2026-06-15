import type { JsonObject } from "@side-chat/shared";
import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ContextSnapshotRecord,
  ConversationRecord,
  ConversationSummaryRecord,
  HostCommandResultRecord,
  MessageRecord,
  ToolInvocationRecord,
  UsageRecord,
} from "./entities.js";
import type {
  ActorId,
  AssistantMessageId,
  AssistantTurnId,
  ConversationId,
  HostCommandId,
  HostSurfaceId,
  ModelId,
  ProviderRequestId,
  RequestId,
  ResourceId,
  SubjectId,
  TargetId,
  ToolCallId,
  UserMessageId,
  WorkspaceId,
} from "./ids/persistence-ids.js";

export type IdempotencyKey = {
  readonly value: string;
};

export type RepositoryCommandEnvelope = {
  readonly workspaceId: WorkspaceId;
  readonly now: string;
};

export type CreateOrGetConversationCommand = RepositoryCommandEnvelope & {
  readonly conversationId?: ConversationId | undefined;
  readonly subjectId: SubjectId;
  readonly actorId: ActorId;
  readonly conversationKey: string;
};

export type AppendMessageCommand = RepositoryCommandEnvelope & {
  readonly conversationId: ConversationId;
  readonly subjectId: SubjectId;
  readonly role: MessageRecord["role"];
  readonly contentText: string;
  readonly metadataJson: JsonObject;
  readonly idempotencyKey: IdempotencyKey;
};

export type StartAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly subjectId: SubjectId;
  readonly actorId: ActorId;
  readonly requestId: RequestId;
  readonly conversationId: ConversationId;
  readonly userMessageId: UserMessageId;
  readonly runtimeProfile: string;
  readonly systemPromptVersion: string;
  readonly contextStrategyVersion: string;
  readonly toolRegistryVersion: string;
  readonly modelProvider: string;
  readonly modelId: ModelId;
};

export type RecordTurnContextSnapshotCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly contextSchemaVersion: string;
  readonly hostSurfaceId?: HostSurfaceId | undefined;
  readonly hostContextHash: string;
  readonly capabilitiesHash: string;
  readonly contextRedactedJson: JsonObject;
};

export type CompleteAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly assistantMessageId: AssistantMessageId;
  readonly finishReason: string;
};

export type FailAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly status: AssistantTurnRecord["status"];
  readonly errorCode: string;
};

export type RecordUsageCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly runtimeStepIndex: number;
  readonly modelProvider: string;
  readonly modelId: ModelId;
  readonly providerRequestId?: ProviderRequestId | undefined;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  readonly costUnits: string;
};

export type ReadUsageSummaryCommand = {
  readonly workspaceId: WorkspaceId;
};

export type UsageSummary = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export type RecordToolInvocationCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly runtimeStepIndex: number;
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly status: ToolInvocationRecord["status"];
  readonly inputHash: string;
  readonly outputHash?: string | undefined;
  readonly inputRedactedJson: JsonObject;
  readonly outputRedactedJson?: JsonObject | undefined;
  readonly errorCode?: string | undefined;
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
};

export type RecordHostCommandResultCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly commandId: HostCommandId;
  readonly commandType: string;
  readonly resourceId?: ResourceId | undefined;
  readonly status: HostCommandResultRecord["status"];
  readonly resultCode: string;
  readonly commandRedactedJson: JsonObject;
  readonly resultRedactedJson?: JsonObject | undefined;
  readonly resolvedAt?: string | undefined;
};

export type ReadConversationHistoryCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
  readonly limit: number;
  readonly afterSequenceIndex?: number | undefined;
  readonly beforeSequenceIndex?: number | undefined;
};

export type ListConversationsCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly limit: number;
};

export type PrepareConversationTitleCommand = RepositoryCommandEnvelope & {
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
  readonly titleText: string;
};

export type ResetConversationCommand = RepositoryCommandEnvelope & {
  readonly subjectId: SubjectId;
  readonly actorId: ActorId;
  readonly conversationId: ConversationId;
  readonly requestId: RequestId;
};

export type AppendAuditEventCommand = RepositoryCommandEnvelope & {
  readonly subjectId: SubjectId;
  readonly actorId: ActorId;
  readonly eventType: string;
  readonly targetType: string;
  readonly targetId: TargetId;
  readonly requestId: RequestId;
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
  | ListConversationsCommand
  | PrepareConversationTitleCommand
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
  readonly listConversations: (
    command: ListConversationsCommand,
  ) => Promise<readonly ConversationSummaryRecord[]>;
  readonly prepareConversationTitle: (
    command: PrepareConversationTitleCommand,
  ) => Promise<ConversationRecord>;
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
