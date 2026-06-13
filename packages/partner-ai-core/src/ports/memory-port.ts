import type { JsonObject } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";

export type MemoryRecallInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly conversationId: string;
  readonly userMessage: string;
  readonly allowedScopes: readonly string[];
  readonly abortSignal?: AbortSignal;
};

export type MemoryRecord = {
  readonly memoryId: string;
  readonly scope: string;
  readonly content: string;
  readonly confidence: number;
  readonly updatedAt: string;
  readonly metadata?: JsonObject;
};

export type MemoryWriteCandidate = {
  readonly candidateId: string;
  readonly scope: string;
  readonly content: string;
  readonly reason: string;
  readonly confidence: number;
  readonly sourceTurnId: string;
  readonly metadata?: JsonObject;
};

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

export type MemoryWriteCandidateRecordInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly assistantTurnId: string;
  readonly candidates: readonly MemoryWriteCandidate[];
};

export type MemoryPort = {
  readonly recall: (input: MemoryRecallInput) => Effect.Effect<readonly MemoryRecord[], unknown>;
  readonly proposeWriteCandidates: (
    input: MemoryWriteCandidateProposalInput,
  ) => Effect.Effect<readonly MemoryWriteCandidate[], unknown>;
  readonly writeCandidates: (
    input: MemoryWriteCandidateRecordInput,
  ) => Effect.Effect<void, unknown>;
};
