import type { JsonObject } from "@side-chat/shared";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";

/**
 * Core memory seam for recall and post-answer write candidates.
 *
 * Authorized turn identity and policy-allowed scopes become `MemoryRecord`
 * values before model execution, then `MemoryWriteCandidate` values after a
 * successful answer. The port exposes scoped content and confidence only; raw
 * storage rows, embedding indexes, and credentials stay inside the app adapter.
 */

/**
 * Request to recall durable memory before model execution.
 *
 * `allowedScopes` is the closed policy result for the turn. Adapters must not
 * widen it based on user message content, host context, or storage defaults.
 */
export type MemoryRecallInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly conversationId: string;
  readonly userMessage: string;
  readonly allowedScopes: readonly string[];
  readonly abortSignal?: AbortSignal;
};

/**
 * Memory content admitted for context consideration.
 *
 * The record is already authorized for the requested workspace and scope, but
 * it is not automatically model-visible. Core receives it as context input and
 * applies admission policy before runtime sees any candidate text.
 */
export type MemoryRecord = {
  readonly memoryId: string;
  readonly scope: string;
  readonly content: string;
  readonly confidence: number;
  readonly updatedAt: string;
  readonly metadata?: JsonObject;
};

/**
 * Proposed durable memory write from a completed assistant turn.
 *
 * This is a candidate, not a committed fact. The adapter may store it for
 * review or auto-apply only according to the selected memory policy and host
 * configuration.
 */
export type MemoryWriteCandidate = {
  readonly candidateId: string;
  readonly scope: string;
  readonly content: string;
  readonly reason: string;
  readonly confidence: number;
  readonly sourceTurnId: string;
  readonly metadata?: JsonObject;
};

/**
 * Input for proposing memory writes after a successful answer.
 *
 * Core supplies user and assistant text so the adapter can suggest candidates,
 * but candidates still flow back through policy-scoped recording instead of
 * silently becoming model-visible memory.
 */
export type MemoryWriteCandidateProposalInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly userMessage: string;
  readonly assistantContent: string;
  readonly allowedScopes: readonly string[];
};

/**
 * Input for recording policy-approved memory write candidates.
 *
 * The adapter receives candidate content and authorized turn identity only.
 * Runtime events, provider messages, and raw protocol payloads are intentionally
 * not part of the storage contract.
 */
export type MemoryWriteCandidateRecordInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly assistantTurnId: string;
  readonly candidates: readonly MemoryWriteCandidate[];
};

/**
 * Durable memory operations used by one assistant turn.
 *
 * Recall happens before the model answers. Write candidates are proposed after
 * a successful answer, and adapters must store them only when the selected
 * memory policy allows writes.
 */
export type MemoryPort = {
  readonly recall: (input: MemoryRecallInput) => Effect.Effect<readonly MemoryRecord[], unknown>;
  readonly proposeWriteCandidates: (
    input: MemoryWriteCandidateProposalInput,
  ) => Effect.Effect<readonly MemoryWriteCandidate[], unknown>;
  readonly writeCandidates: (
    input: MemoryWriteCandidateRecordInput,
  ) => Effect.Effect<void, unknown>;
};
