import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { ConversationRef, MemoryPort, MemoryWriteCandidate } from "#ports";
import type { TurnPolicyDecision } from "#domain/harness";
import type { PartnerAiCoreError as PartnerAiCoreErrorType } from "#errors";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";

export type RecordAllowedMemoryWriteCandidatesInput = {
  readonly memory: MemoryPort;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly conversation: ConversationRef;
  readonly assistantTurnId: string;
  readonly policyDecision: TurnPolicyDecision;
  readonly assistantContent: string;
};

export const recordAllowedMemoryWriteCandidates = ({
  memory,
  authContext,
  workspace,
  request,
  conversation,
  assistantTurnId,
  policyDecision,
  assistantContent,
}: RecordAllowedMemoryWriteCandidatesInput): Effect.Effect<
  readonly MemoryWriteCandidate[],
  PartnerAiCoreErrorType
> => {
  const allowedScopes = policyDecision.memoryScope.scopes;
  if (
    policyDecision.memoryScope.mode !== "read_write" ||
    allowedScopes.length === 0 ||
    assistantContent.trim().length === 0
  ) {
    return Effect.succeed([]);
  }

  return mapPortFailure(
    memory.proposeWriteCandidates({
      authContext,
      workspace,
      requestId: request.requestId,
      conversationId: conversation.conversationId,
      assistantTurnId,
      userMessage: request.message.content,
      assistantContent,
      allowedScopes,
    }),
    STREAM_CHAT_FAILURES.MEMORY_WRITE_CANDIDATES,
  ).pipe(
    Effect.map((candidates) => filterAllowedMemoryWriteCandidates(candidates, allowedScopes)),
    Effect.flatMap((candidates) =>
      recordCandidates(memory, authContext, workspace, assistantTurnId, candidates),
    ),
  );
};

const recordCandidates = (
  memory: MemoryPort,
  authContext: AuthContext,
  workspace: WorkspaceRef,
  assistantTurnId: string,
  candidates: readonly MemoryWriteCandidate[],
): Effect.Effect<readonly MemoryWriteCandidate[], PartnerAiCoreErrorType> => {
  if (candidates.length === 0) return Effect.succeed(candidates);

  return mapPortFailure(
    memory.writeCandidates({ authContext, workspace, assistantTurnId, candidates }),
    STREAM_CHAT_FAILURES.MEMORY_WRITE_CANDIDATES,
  ).pipe(Effect.as(candidates));
};

const filterAllowedMemoryWriteCandidates = (
  candidates: readonly MemoryWriteCandidate[],
  allowedScopes: readonly string[],
): readonly MemoryWriteCandidate[] => {
  const allowed = new Set(allowedScopes);
  return candidates.filter((candidate) => allowed.has(candidate.scope));
};
