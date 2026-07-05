import type {
  ChatStreamRequest,
  ProtocolErrorCode,
  SidechatBlockedReason,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { PreparedTurnContext } from "#domain/capabilities-contract";
import type { ConversationRef, MessageRef } from "./conversation.js";

export type AssistantTurnFailureStatus =
  // A safety stop: the turn was blocked before a usable answer. Distinct from
  // provider_failed so audits can tell a filtered turn from a provider outage.
  | "blocked"
  | "user_aborted"
  | "timed_out"
  | "provider_failed"
  | "tool_failed"
  | "persistence_failed";

export type AssistantTurnStatus = "running" | "completed" | AssistantTurnFailureStatus;

export type AssistantTurnRef = WorkspaceRef & {
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly status: AssistantTurnStatus;
  readonly inserted: boolean;
};

/**
 * Store the lifecycle of one assistant reply.
 *
 * Start it, save the prepared context, then write either completed or failed.
 *
 * Two invariants make exactly-one-terminal safe under retries and multi-instance
 * races; the `@side-chat/db` `sidechatRepositoryContract` kit
 * (`packages/db/src/testing/repository-contract.test-support.ts`) is the
 * executable spec, so a custom adapter proves them by passing that suite:
 * `startAssistantTurn` is get-or-create (see its own doc), and
 * `completeAssistantTurn`/`failAssistantTurn` are first-transition-wins.
 */
export type AssistantTurnLifecyclePort = {
  /**
   * Get-or-create the assistant turn for `(workspace_id, request_id)`.
   *
   * A retried POST with the same request id must return the SAME turn, not a
   * second one: the returned `AssistantTurnRef.inserted` is `true` only for the
   * row this call created and `false` for a replay. This is what lets one browser
   * request id resolve to one durable turn across reconnects and instances.
   */
  readonly startAssistantTurn: (input: {
    readonly authContext: AuthContext;
    readonly conversation: ConversationRef;
    readonly userMessage: MessageRef;
    readonly request: ChatStreamRequest;
    readonly profileId: string;
    readonly profileVersion: string;
    readonly systemPromptId: string;
    readonly manifestHash: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly now: string;
  }) => Effect.Effect<AssistantTurnRef, unknown>;
  readonly recordContextSnapshot: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly preparedContext: PreparedTurnContext;
    readonly hostContext: ChatStreamRequest["hostContext"];
    readonly manifestHash: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
  /**
   * Terminalize a running turn as completed. First transition wins.
   *
   * The write must apply only while the turn is still `running` and be a no-op
   * once any terminal (complete or fail) already transitioned it — so a late
   * finalizer racing a real terminal can never overwrite the honest outcome.
   * `finalize-turn-generation.ts` leans on this to keep exactly one status change.
   */
  readonly completeAssistantTurn: (input: {
    readonly authContext: AuthContext;
    readonly conversation: ConversationRef;
    readonly request: ChatStreamRequest;
    readonly assistantTurnId: string;
    readonly assistantContent: string;
    readonly finishReason: string;
    readonly usage?: UsageMetadata | undefined;
    readonly providerId: string;
    readonly modelId: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
  /**
   * Terminalize a running turn as failed. First transition wins (see
   * `completeAssistantTurn`): only a still-running turn transitions, so the first
   * terminal to land is durable and every later complete/fail is a no-op.
   */
  readonly failAssistantTurn: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly status: AssistantTurnFailureStatus;
    /** A protocol error code, or the blocked reason for a `blocked` status. */
    readonly errorCode: ProtocolErrorCode | SidechatBlockedReason;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
  /**
   * Read the control state finalize needs to terminalize a turn honestly.
   *
   * `status` is the durable turn status (so the abnormal finalizer can skip the
   * status write once a real terminal already won the running-guard), and
   * `cancelRequested` reflects the durable cancel intent (so an interrupt is
   * classified as a user abort only when a cancel was actually requested).
   * Returns `undefined` for an unknown or cross-workspace turn.
   */
  readonly readTurnControlState: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
  }) => Effect.Effect<TurnControlState | undefined, unknown>;
  /**
   * Read the conversation's in-flight turn, if one is running.
   *
   * The concurrent-turn guard consults this at pre-start: a running turn from a
   * different request means the conversation is busy (a second tab or client),
   * while a running turn from the same request is this request's own idempotent
   * retry. Returns `undefined` when no turn is running. Best-effort: two
   * genuinely simultaneous fresh requests can still both pass, which the reaper
   * and lease fencing already tolerate.
   */
  readonly findActiveConversationTurn: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
  }) => Effect.Effect<ActiveConversationTurn | undefined, unknown>;
  /**
   * Claim the owner lease for a running turn before generation streams.
   *
   * Compare-and-set: it takes ownership, bumps the fencing epoch, and sets the
   * lease window. The returned epoch is what the heartbeat must echo on every
   * `renewTurnLease`. `acquired` is false for a turn that is no longer running, so
   * the runner can stop instead of generating a turn it does not own.
   */
  readonly acquireTurnLease: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly ownerInstanceId: string;
    readonly leaseTtlMs: number;
    readonly now: string;
  }) => Effect.Effect<TurnLeaseClaim, unknown>;
  /**
   * Renew the owner lease from the heartbeat, scoped to the held epoch.
   *
   * `renewed: false` means the owner was fenced (the epoch advanced underneath
   * it), so the heartbeat must interrupt its generation so a stale owner never
   * double-writes the turn.
   */
  readonly renewTurnLease: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly ownerInstanceId: string;
    readonly leaseEpoch: number;
    readonly leaseTtlMs: number;
    readonly now: string;
  }) => Effect.Effect<TurnLeaseRenewal, unknown>;
};

/** The conversation's running turn and the request that started it. */
export type ActiveConversationTurn = {
  readonly assistantTurnId: string;
  readonly requestId: string;
};

/** Outcome of claiming the owner lease, carrying the epoch the heartbeat echoes. */
export type TurnLeaseClaim = {
  readonly acquired: boolean;
  readonly leaseEpoch: number;
};

/** Outcome of one heartbeat renewal; `renewed: false` means the owner was fenced. */
export type TurnLeaseRenewal = {
  readonly renewed: boolean;
};

/** Durable control facts an abnormal finalize reads to terminalize honestly. */
export type TurnControlState = {
  readonly status: AssistantTurnStatus;
  readonly cancelRequested: boolean;
};
