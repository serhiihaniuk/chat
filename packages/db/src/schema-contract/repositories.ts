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
  AssistantMessageId,
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
import type { ClientToolDispatchRepositoryContract } from "./client-tools/repositories.js";

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
};

export type RecordTurnContextSnapshotCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly contextSchemaVersion: string;
  readonly hostSurfaceId?: HostSurfaceId | undefined;
  readonly hostContextHash: string;
  readonly capabilitiesHash: string;
  readonly contextRedactedJson: JsonObject;
};

export type BindTurnRunCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  /** The durable Workflow run id; bound once, after the run starts. */
  readonly runId: string;
};

/** Aggregate token usage across a turn's steps, folded onto the terminal write. */
export type TurnUsageTotals = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
};

/**
 * The one guarded transition that moves a turn from `running` to a terminal status.
 *
 * `status` is any terminal (never `running`). `assistantMessageId`/`finishReason`
 * accompany a completed or blocked turn; `errorCode` a failed one. The repository
 * applies it as a single `UPDATE ... WHERE status = 'running'`, so a replay after
 * a crash and a second finalize are both no-ops.
 */
export type ClaimAssistantTurnTerminalCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly status: Exclude<AssistantTurnRecord["status"], "running">;
  readonly assistantMessageId?: AssistantMessageId | undefined;
  readonly finishReason?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly usage: TurnUsageTotals;
};

/**
 * Outcome of a terminal claim.
 *
 * `claimed` is true only when this call moved the turn from `running` to a
 * terminal status. It is false for an already-terminal turn (idempotent replay)
 * or an unknown/cross-tenant id; `record` returns the current stored row either way.
 */
export type ClaimAssistantTurnTerminalResult = {
  readonly record: AssistantTurnRecord;
  readonly claimed: boolean;
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

export type SubmitClientToolOutputDisposition =
  | "accepted"
  | "duplicate"
  | "late";

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

export type FindConversationCommand = {
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
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
  | ClaimAssistantTurnTerminalCommand
  | RecordUsageCommand
  | ReadUsageSummaryCommand
  | RecordToolInvocationCommand
  | CreateClientToolDispatchCommand
  | ClaimClientToolTimeoutCommand
  | ClaimClientToolAbortCommand
  | SubmitClientToolOutputCommand
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
  readonly resetConversation: (
    command: ResetConversationCommand,
  ) => Promise<ConversationRecord>;
};

export type AssistantTurnRepositoryContract = {
  // Open a running turn. Idempotent on `(workspace_id, request_id)`: a replayed
  // start returns the existing row (`inserted: false`). The one-running-per-
  // conversation partial unique index is the race-safe busy guard — a concurrent
  // second running turn raises `conversation_busy` rather than a check-then-act
  // window.
  readonly startAssistantTurn: (
    command: StartAssistantTurnCommand,
  ) => Promise<RepositoryCommandResult<AssistantTurnRecord>>;
  // Bind the durable Workflow run id to a turn once its run has started.
  readonly bindTurnRun: (
    command: BindTurnRunCommand,
  ) => Promise<AssistantTurnRecord>;
  readonly recordTurnContextSnapshot: (
    command: RecordTurnContextSnapshotCommand,
  ) => Promise<RepositoryCommandResult<ContextSnapshotRecord>>;
  // Moves a turn from `running` to a terminal status in one `UPDATE ... WHERE
  // status = 'running'`, and returns `claimed: false` for an already-terminal
  // turn — so a crash replay and a duplicate finalize are both no-ops. This is
  // what makes "no turn ends without durable status" hold without a reaper.
  readonly claimAssistantTurnTerminal: (
    command: ClaimAssistantTurnTerminalCommand,
  ) => Promise<ClaimAssistantTurnTerminalResult>;
  // Turn-record reads for the resumable routes, all workspace-scoped and
  // returning `undefined` (not throwing) for an unknown or cross-tenant id, so a
  // guessed id maps to a not-found response. `findActiveAssistantTurn` answers
  // "is there a running turn to resume?"; `findAssistantTurnByRequest` is the
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
  // Every running turn for a subject across conversations. Powers the activity
  // stream's snapshot on connect (one entry per conversation with a live turn).
  readonly listActiveAssistantTurns: (
    command: ListActiveAssistantTurnsCommand,
  ) => Promise<readonly AssistantTurnRecord[]>;
  readonly recordUsage: (
    command: RecordUsageCommand,
  ) => Promise<RepositoryCommandResult<UsageRecord>>;
  readonly readUsageSummary: (
    command: ReadUsageSummaryCommand,
  ) => Promise<UsageSummary>;
};

export type InteractionRepositoryContract =
  ClientToolDispatchRepositoryContract & {
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
