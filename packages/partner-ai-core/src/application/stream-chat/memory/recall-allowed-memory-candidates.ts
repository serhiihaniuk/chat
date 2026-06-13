import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import { optionalField } from "@side-chat/shared";
import { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { ConversationRef, MemoryPort, MemoryRecord } from "#ports";
import type { TurnPolicyDecision } from "#domain/harness";
import type { PartnerAiCoreError as PartnerAiCoreErrorType } from "#errors";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";

const DEFAULT_MEMORY_CANDIDATE_LIMIT = 5;

export type RecallAllowedMemoryCandidatesInput = {
  readonly memory: MemoryPort;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly conversation: ConversationRef;
  readonly policyDecision: TurnPolicyDecision;
  readonly abortSignal?: AbortSignal;
  readonly maxCandidates?: number;
};

export const recallAllowedMemoryCandidates = ({
  memory,
  authContext,
  workspace,
  request,
  conversation,
  policyDecision,
  abortSignal,
  maxCandidates = DEFAULT_MEMORY_CANDIDATE_LIMIT,
}: RecallAllowedMemoryCandidatesInput): Effect.Effect<
  readonly MemoryRecord[],
  PartnerAiCoreErrorType
> => {
  const allowedScopes = policyDecision.memoryScope.scopes;
  if (policyDecision.memoryScope.mode === "disabled" || allowedScopes.length === 0) {
    return Effect.succeed([]);
  }

  return mapPortFailure(
    memory.recall({
      authContext,
      workspace,
      requestId: request.requestId,
      conversationId: conversation.conversationId,
      userMessage: request.message.content,
      allowedScopes,
      ...optionalField("abortSignal", abortSignal),
    }),
    STREAM_CHAT_FAILURES.CONTEXT,
  ).pipe(
    Effect.map((records) => filterAllowedMemoryRecords(records, allowedScopes, maxCandidates)),
  );
};

const filterAllowedMemoryRecords = (
  records: readonly MemoryRecord[],
  allowedScopes: readonly string[],
  maxCandidates: number,
): readonly MemoryRecord[] => {
  const allowed = new Set(allowedScopes);
  return records.filter((record) => allowed.has(record.scope)).slice(0, maxCandidates);
};
