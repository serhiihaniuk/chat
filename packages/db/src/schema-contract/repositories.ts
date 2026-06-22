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
  TurnEventRecord,
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
import type { TurnEventType } from "./lifecycle.js";

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

export type RequestTurnCancellationCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
};

/**
 * Outcome of recording a durable cancel intent.
 *
 * `cancelRequested` is true only when this call moved a still-running turn into
 * the cancel-requested state (and notified). It is false for an unknown,
 * cross-workspace, or already-terminal turn, so a cancel of a finished turn is a
 * no-op rather than an error.
 */
export type RequestTurnCancellationResult = {
  readonly cancelRequested: boolean;
};

export type AcquireTurnLeaseCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly ownerInstanceId: string;
  /** Lease window in ms; the new expiry is `now + leaseTtlMs`. */
  readonly leaseTtlMs: number;
};

/**
 * Outcome of claiming the lease for one running turn.
 *
 * `leaseEpoch` is the post-bump epoch the owner must echo on every heartbeat
 * `renewTurnLease` so a fenced owner (epoch advanced underneath it) sees `0` rows
 * and stops. `acquired` is false for an unknown, cross-workspace, or already
 * terminal turn (nothing matched the CAS), so a lost-race claim never strands.
 */
export type AcquireTurnLeaseResult = {
  readonly acquired: boolean;
  readonly leaseEpoch: number;
};

export type RenewTurnLeaseCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly ownerInstanceId: string;
  /** Epoch the acquiring call returned; the renew CAS is scoped to it. */
  readonly leaseEpoch: number;
  readonly leaseTtlMs: number;
};

/**
 * Outcome of a heartbeat renewal.
 *
 * `renewed` is true only while this owner still holds the lease at the expected
 * epoch. A `false` result means the owner was fenced (the reaper or a new owner
 * bumped the epoch), so the caller must interrupt its generation to never
 * double-write.
 */
export type RenewTurnLeaseResult = {
  readonly renewed: boolean;
};

export type ReapExpiredTurnsCommand = {
  readonly now: string;
  /** Upper bound on reaped turns per pass, so one sweep cannot run unbounded. */
  readonly limit: number;
};

/**
 * One turn the reaper terminalized because its lease expired while running.
 *
 * `cancelRequested` carries the durable cancel intent so the reaper appends the
 * honest synthetic terminal (a cancel becomes `user_aborted`, otherwise a
 * `provider_failed` timeout). `leaseEpoch` is the post-bump epoch the CAS fenced
 * the dead owner with.
 */
export type ReapedTurn = {
  readonly workspaceId: WorkspaceId;
  readonly assistantTurnId: AssistantTurnId;
  readonly cancelRequested: boolean;
  readonly leaseEpoch: number;
};

export type AppendTurnEventCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly sequence: number;
  readonly type: TurnEventType;
  readonly payloadJson: JsonObject;
};

export type PruneTurnEventsCommand = {
  /** Delete the event rows of terminal turns whose `completed_at` is before this instant. */
  readonly completedBefore: string;
  /** Upper bound on turns pruned per pass, so one sweep cannot run unbounded. */
  readonly limit: number;
};

/**
 * Outcome of one turn_events retention sweep.
 *
 * `prunedTurns` is how many terminal turns had their event log deleted this pass;
 * `deletedEvents` is the total rows removed. The consolidated turn record and the
 * assistant message are never touched — only the now-redundant event log — so a
 * pruned turn still resolves and falls back to conversation history on resume.
 */
export type PruneTurnEventsResult = {
  readonly prunedTurns: number;
  readonly deletedEvents: number;
};

export type MinTurnEventSequenceCommand = {
  readonly workspaceId: WorkspaceId;
  readonly assistantTurnId: AssistantTurnId;
};

export type ReadTurnEventsAfterCommand = {
  readonly workspaceId: WorkspaceId;
  readonly assistantTurnId: AssistantTurnId;
  /** Exclusive lower bound; `-1` returns the whole log from sequence 0. */
  readonly after: number;
};

export type MaxTurnEventSequenceCommand = {
  readonly workspaceId: WorkspaceId;
  readonly assistantTurnId: AssistantTurnId;
};

export type FindAssistantTurnCommand = {
  readonly workspaceId: WorkspaceId;
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
  | RequestTurnCancellationCommand
  | AcquireTurnLeaseCommand
  | RenewTurnLeaseCommand
  | AppendTurnEventCommand
  | ReadTurnEventsAfterCommand
  | MaxTurnEventSequenceCommand
  | MinTurnEventSequenceCommand
  | PruneTurnEventsCommand
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
  readonly resetConversation: (
    command: ResetConversationCommand,
  ) => Promise<ConversationRecord>;
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
  readonly failAssistantTurn: (
    command: FailAssistantTurnCommand,
  ) => Promise<AssistantTurnRecord>;
  // Record durable cancel intent for a running turn and notify the cancel channel
  // in one transaction (notify fires on commit). CAS-guarded to running turns, so
  // a cancel of an unknown, cross-workspace, or already-terminal turn is a no-op
  // (`cancelRequested: false`), never an error. Works from any instance; the
  // owning instance reacts to the notify by interrupting its live fiber.
  readonly requestTurnCancellation: (
    command: RequestTurnCancellationCommand,
  ) => Promise<RequestTurnCancellationResult>;
  // Claim ownership of a running turn for one instance: CAS sets owner, bumps the
  // epoch, and extends the lease WHERE the turn is still running. The returned
  // epoch is what the owner's heartbeat must echo. A non-running/unknown turn does
  // not match, so `acquired` is false rather than an error.
  readonly acquireTurnLease: (
    command: AcquireTurnLeaseCommand,
  ) => Promise<AcquireTurnLeaseResult>;
  // Heartbeat the lease: CAS extends the expiry WHERE the turn is still running and
  // owner+epoch still match. `renewed: false` means the owner was fenced (epoch
  // advanced underneath it), so the caller must stop generation.
  readonly renewTurnLease: (
    command: RenewTurnLeaseCommand,
  ) => Promise<RenewTurnLeaseResult>;
  // Reaper sweep: atomically terminalize every running turn whose lease expired,
  // bumping the epoch to fence its (dead or slow) owner. The status is the honest
  // terminal — `user_aborted` when a cancel was requested, else `provider_failed`.
  // Returns the reaped turns so the caller appends one synthetic terminal each;
  // two concurrent sweeps cannot both reap a turn because the running-guard CAS
  // matches only once.
  readonly reapExpiredTurns: (
    command: ReapExpiredTurnsCommand,
  ) => Promise<readonly ReapedTurn[]>;
  // Append one stream event and notify subscribers in one transaction. Idempotent
  // on `(assistantTurnId, sequence)` (identical re-append returns `inserted:
  // false`; a different payload rejects with `event_log_conflict`); at most one
  // terminal-typed row per turn.
  readonly appendTurnEvent: (
    command: AppendTurnEventCommand,
  ) => Promise<RepositoryCommandResult<TurnEventRecord>>;
  readonly readTurnEventsAfter: (
    command: ReadTurnEventsAfterCommand,
  ) => Promise<readonly TurnEventRecord[]>;
  readonly maxTurnEventSequence: (
    command: MaxTurnEventSequenceCommand,
  ) => Promise<number | undefined>;
  // Smallest still-stored sequence for a turn, or `undefined` when none remain.
  // The stream route reads it to spot a pruned gap (see `isReplayExpired`).
  readonly minTurnEventSequence: (
    command: MinTurnEventSequenceCommand,
  ) => Promise<number | undefined>;
  // Retention sweep: delete the turn_events of terminal turns completed before the
  // cutoff, keeping the consolidated turn record and assistant message. Batched and
  // safe to run on every instance; a pruned turn falls back to conversation history
  // on resume. Returns how many turns and rows were pruned for diagnostics.
  readonly pruneTurnEventsBefore: (
    command: PruneTurnEventsCommand,
  ) => Promise<PruneTurnEventsResult>;
  // Turn-record reads for the resumable routes, all workspace-scoped and
  // returning `undefined` (not throwing) for an unknown or cross-tenant id, so a
  // guessed id maps to a not-found response. `findActiveAssistantTurn` answers
  // "is there a running turn to resume?"; `findAssistantTurnByRequest` is the
  // lost-`POST /chat/runs`-reply resolver from `requestId` to the canonical turn.
  readonly findAssistantTurn: (
    command: FindAssistantTurnCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  readonly findAssistantTurnByRequest: (
    command: FindAssistantTurnByRequestCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  readonly findActiveAssistantTurn: (
    command: FindActiveAssistantTurnCommand,
  ) => Promise<AssistantTurnRecord | undefined>;
  readonly recordUsage: (
    command: RecordUsageCommand,
  ) => Promise<RepositoryCommandResult<UsageRecord>>;
  readonly readUsageSummary: (
    command: ReadUsageSummaryCommand,
  ) => Promise<UsageSummary>;
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
