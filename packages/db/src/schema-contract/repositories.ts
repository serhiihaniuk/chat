import type { JsonObject } from "@side-chat/shared";
import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ClientToolDispatchRecord,
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
  AssistantTurnId,
  ConversationId,
  HostCommandId,
  HostSurfaceId,
  MessageId,
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
import type { RepositoryCommandEnvelope } from "./shared/command-envelope.js";
import type {
  BindTurnRunCommand,
  ClaimTurnRunCommand,
  ClaimTurnRunResult,
  FinalizeAssistantTurnCommand,
  FinalizeAssistantTurnResult,
  RequestTurnCancellationCommand,
  ResolveConversationTurnAvailabilityCommand,
  TurnCancellationDisposition,
} from "./turn-lifecycle/commands.js";
import type { ClientToolDispatchRepositoryContract } from "./client-tools/repositories.js";
import type {
  ConversationSnapshotRecord,
  FindConversationCommand,
  ListConversationsCommand,
  ReadConversationHistoryCommand,
  ReadConversationSnapshotCommand,
} from "./conversation-state/queries.js";
import type {
  CreateOrGetToolApprovalCommand,
  DecideToolApprovalCommand,
  ExpireToolApprovalCommand,
  ToolApprovalRepositoryContract,
} from "./approvals/repositories.js";
export type { RepositoryCommandEnvelope } from "./shared/command-envelope.js";
export {
  TURN_CANCELLATION_DISPOSITIONS,
  type BindTurnRunCommand,
  type ClaimTurnRunCommand,
  type ClaimTurnRunResult,
  type FinalizeAssistantTurnCommand,
  type FinalizeAssistantTurnResult,
  type RequestTurnCancellationCommand,
  type ResolveConversationTurnAvailabilityCommand,
  type TurnCancellationDisposition,
  type TurnUsageTotals,
} from "./turn-lifecycle/commands.js";

export type CreateOrGetConversationCommand = RepositoryCommandEnvelope & {
  readonly conversationId?: ConversationId | undefined;
  readonly subjectId: SubjectId;
  readonly actorId: ActorId;
  readonly conversationKey: string;
};

export type AppendMessageCommand = RepositoryCommandEnvelope & {
  readonly conversationId: ConversationId;
  readonly subjectId: SubjectId;
  /** Deterministic, caller-generated id — the idempotency key: a replayed append
   *  with the same id is a no-op that returns the stored row. */
  readonly messageId: MessageId;
  readonly role: MessageRecord["role"];
  readonly parts: readonly JsonObject[];
  readonly metadataJson: JsonObject;
};

export type StartAssistantTurnCommand = RepositoryCommandEnvelope & {
  readonly subjectId: SubjectId;
  readonly actorId: ActorId;
  readonly requestId: RequestId;
  readonly conversationId: ConversationId;
  readonly userMessageId: UserMessageId;
  readonly modelProvider: string;
  readonly modelId: ModelId;
  readonly instructionsVersion: string;
  readonly configVersion: string;
  readonly contentFilterVersion: string;
  readonly recoveryGraceMs?: number | undefined;
};

export type RecordTurnContextSnapshotCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly contextSchemaVersion: string;
  readonly hostSurfaceId?: HostSurfaceId | undefined;
  readonly hostContextHash: string;
  readonly capabilitiesHash: string;
  readonly contextRedactedJson: JsonObject;
};

export type FindAssistantTurnCommand = {
  readonly workspaceId: WorkspaceId;
  // A turn belongs to the subject that started it; reads (status, stream replay,
  // host-command result) are scoped to that subject so a leaked turn id from
  // another user cannot be tailed. Cross-subject lookups return `undefined`.
  readonly subjectId: SubjectId;
  readonly assistantTurnId: AssistantTurnId;
};
export type FindAssistantTurnByRequestCommand = {
  readonly workspaceId: WorkspaceId;
  readonly requestId: RequestId;
};
export type FindActiveAssistantTurnCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
};
export type FindAssistantTurnByRunCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly runId: string;
};

export type ListActiveAssistantTurnsCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
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

export type CreateClientToolDispatchCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
};

export type FindClientToolDispatchCommand = {
  readonly workspaceId: WorkspaceId;
  readonly assistantTurnId: AssistantTurnId;
  readonly toolCallId: ToolCallId;
};

type ClaimClientToolDispatchCommand = RepositoryCommandEnvelope &
  FindClientToolDispatchCommand & {
    readonly outputJson?: JsonObject | undefined;
  };

export type ClaimClientToolTimeoutCommand = ClaimClientToolDispatchCommand & {
  readonly outputJson: JsonObject;
};

export type ClaimClientToolAbortCommand = ClaimClientToolDispatchCommand & {
  readonly outputJson: JsonObject;
};

export type ClaimClientToolDispatchResult = {
  readonly record: ClientToolDispatchRecord;
  readonly claimed: boolean;
};

export type SubmitClientToolOutputCommand = RepositoryCommandEnvelope &
  FindClientToolDispatchCommand & {
    readonly state: "settled" | "failed";
    readonly outputJson: JsonObject;
  };

export type SubmitClientToolOutputDisposition = "accepted" | "duplicate" | "late";

export type SubmittedClientToolDispatchRecord = Omit<
  ClientToolDispatchRecord,
  "outputJson" | "state"
> & {
  readonly state: "settled" | "failed" | "late" | "aborted";
  readonly outputJson: JsonObject;
};

export type SubmitClientToolOutputResult = {
  readonly record: SubmittedClientToolDispatchRecord;
  readonly disposition: SubmitClientToolOutputDisposition;
};

export type FindHostCommandResultCommand = {
  readonly workspaceId: WorkspaceId;
  readonly assistantTurnId: AssistantTurnId;
  readonly commandId: HostCommandId;
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

export type {
  ConversationSnapshotRecord,
  FindConversationCommand,
  ListConversationsCommand,
  ReadConversationHistoryCommand,
  ReadConversationSnapshotCommand,
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
  | BindTurnRunCommand
  | RecordTurnContextSnapshotCommand
  | FinalizeAssistantTurnCommand
  | RecordUsageCommand
  | ReadUsageSummaryCommand
  | RecordToolInvocationCommand
  | CreateClientToolDispatchCommand
  | ClaimClientToolTimeoutCommand
  | ClaimClientToolAbortCommand
  | SubmitClientToolOutputCommand
  | CreateOrGetToolApprovalCommand
  | DecideToolApprovalCommand
  | ExpireToolApprovalCommand
  | RecordHostCommandResultCommand
  | ReadConversationHistoryCommand
  | ReadConversationSnapshotCommand
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
  /** One repeatable-read snapshot for refresh/recovery; never tears history from active-turn state. */
  readonly readConversationSnapshot: (
    command: ReadConversationSnapshotCommand,
  ) => Promise<ConversationSnapshotRecord>;
  readonly listConversations: (
    command: ListConversationsCommand,
  ) => Promise<readonly ConversationSummaryRecord[]>;
  // Read one conversation by id, scoped to workspace + subject. Returns
  // `undefined` (never throws) for an unknown or cross-tenant id, so the service
  // maps a guessed or leaked id to a not-found response instead of leaking
  // another subject's conversation.
  readonly findConversation: (
    command: FindConversationCommand,
  ) => Promise<ConversationRecord | undefined>;
  readonly prepareConversationTitle: (
    command: PrepareConversationTitleCommand,
  ) => Promise<ConversationRecord>;
  readonly resetConversation: (command: ResetConversationCommand) => Promise<ConversationRecord>;
};

export type AssistantTurnRepositoryContract = {
  // Open a product turn. Idempotent on `(workspace_id, request_id)`: a replayed
  // start returns the existing row (`inserted: false`). The one-open-per-
  // conversation partial unique index is the race-safe busy guard — a concurrent
  // second open turn raises `conversation_busy` rather than a check-then-act
  // window.
  readonly startAssistantTurn: (
    command: StartAssistantTurnCommand,
  ) => Promise<RepositoryCommandResult<AssistantTurnRecord>>;
  // Bind the durable Workflow run id to a turn once its run has started.
  readonly bindTurnRun: (command: BindTurnRunCommand) => Promise<AssistantTurnRecord>;
  /** Workflow-side pre-provider fence and idempotent run binding. */
  readonly claimTurnRun: (command: ClaimTurnRunCommand) => Promise<ClaimTurnRunResult>;
  /** Resolve and guardedly repair the existing product slot before admission. */
  readonly resolveConversationTurnAvailability: (
    command: ResolveConversationTurnAvailabilityCommand,
  ) => Promise<boolean>;
  /** Persist user intent before Workflow cancellation delivery is attempted. */
  readonly requestTurnCancellation: (
    command: RequestTurnCancellationCommand,
  ) => Promise<TurnCancellationDisposition>;
  readonly recordTurnContextSnapshot: (
    command: RecordTurnContextSnapshotCommand,
  ) => Promise<RepositoryCommandResult<ContextSnapshotRecord>>;
  // Finalizes one open turn as an aggregate transaction: the guarded status
  // transition, optional assistant message, usage, conversation timestamp, and
  // activity notification become visible together. An already-terminal replay
  // returns `claimed: false`, so duplicate Workflow steps are no-ops.
  readonly finalizeAssistantTurn: (
    command: FinalizeAssistantTurnCommand,
  ) => Promise<FinalizeAssistantTurnResult>;
  // Turn-record reads for the resumable routes, all workspace-scoped and
  // returning `undefined` (not throwing) for an unknown or cross-tenant id, so a
  // guessed id maps to a not-found response. `findActiveAssistantTurn` answers
  // "is there an effectively active turn to resume?"; `findAssistantTurnByRequest` is the
  // lost-`POST /chat`-reply resolver from `requestId` to the canonical turn.
  readonly findAssistantTurn: (
    command: FindAssistantTurnCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  readonly findAssistantTurnByRequest: (
    command: FindAssistantTurnByRequestCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  readonly findActiveAssistantTurn: (
    command: FindActiveAssistantTurnCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  // Resolve one turn from the durable run id it is bound to, scoped to
  // workspace + subject. Callers that also hold a conversation id compare it
  // with the returned record. Returns `undefined` (never throws) for an unknown
  // or cross-tenant run id so run-only replay routes do not leak existence.
  readonly findAssistantTurnByRun: (
    command: FindAssistantTurnByRunCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  // Every effectively active turn for a subject across conversations. Powers the activity
  // stream's snapshot on connect (one entry per conversation with a live turn).
  readonly listActiveAssistantTurns: (
    command: ListActiveAssistantTurnsCommand,
  ) => Promise<readonly AssistantTurnRecord[]>;
  readonly recordUsage: (
    command: RecordUsageCommand,
  ) => Promise<RepositoryCommandResult<UsageRecord>>;
  readonly readUsageSummary: (command: ReadUsageSummaryCommand) => Promise<UsageSummary>;
};

export type InteractionRepositoryContract = ClientToolDispatchRepositoryContract &
  ToolApprovalRepositoryContract & {
    readonly recordToolInvocation: (
      command: RecordToolInvocationCommand,
    ) => Promise<RepositoryCommandResult<ToolInvocationRecord>>;
    readonly recordHostCommandResult: (
      command: RecordHostCommandResultCommand,
    ) => Promise<RepositoryCommandResult<HostCommandResultRecord>>;
    /**
     * Read one turn's host-command row by command id (workspace-scoped).
     *
     * The result relay reads through this twice: the result route to prove the
     * command belongs to the caller's turn before persisting the browser's
     * result, and the awaiting owner (listener or poll) to fetch the settled
     * result. Returns `undefined` for an unknown or cross-workspace command.
     */
    readonly findHostCommandResult: (
      command: FindHostCommandResultCommand,
    ) => Promise<HostCommandResultRecord | undefined>;
    readonly appendAuditEvent: (
      command: AppendAuditEventCommand,
    ) => Promise<RepositoryCommandResult<AuditEventRecord>>;
  };
