import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { TurnPolicyDecision } from "#domain/harness";
import type { RagContextCandidate, RagRetrieverPort, RagRetrievalInput } from "#ports";
import type { PartnerAiCoreError as PartnerAiCoreErrorType } from "#errors";
import { optionalField } from "@side-chat/shared";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";

const DEFAULT_RAG_CANDIDATE_LIMIT = 5;

export type RetrieveAllowedRagCandidatesInput = {
  readonly retriever: RagRetrieverPort;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly policyDecision: TurnPolicyDecision;
  readonly abortSignal?: AbortSignal;
  readonly maxCandidates?: number;
};

export const retrieveAllowedRagCandidates = ({
  retriever,
  authContext,
  workspace,
  request,
  policyDecision,
  abortSignal,
  maxCandidates = DEFAULT_RAG_CANDIDATE_LIMIT,
}: RetrieveAllowedRagCandidatesInput): Effect.Effect<
  readonly RagContextCandidate[],
  PartnerAiCoreErrorType
> => {
  if (policyDecision.retrievalSourceIds.length === 0) return Effect.succeed([]);

  return mapPortFailure(
    retriever.retrieve(
      createRagRetrievalInput({
        authContext,
        workspace,
        request,
        policyDecision,
        maxCandidates,
        ...optionalField("abortSignal", abortSignal),
      }),
    ),
    STREAM_CHAT_FAILURES.CONTEXT,
  ).pipe(
    Effect.map((candidates) =>
      filterAllowedRagCandidates(candidates, policyDecision.retrievalSourceIds, maxCandidates),
    ),
  );
};

const createRagRetrievalInput = ({
  authContext,
  workspace,
  request,
  policyDecision,
  abortSignal,
  maxCandidates,
}: RagRetrievalInputFactory): RagRetrievalInput => ({
  authContext,
  workspace,
  requestId: request.requestId,
  userMessage: request.message.content,
  ...(request.hostContext ? { hostContext: request.hostContext } : {}),
  allowedSourceIds: policyDecision.retrievalSourceIds,
  maxCandidates,
  ...(abortSignal ? { abortSignal } : {}),
});

type RagRetrievalInputFactory = Omit<
  RetrieveAllowedRagCandidatesInput,
  "retriever" | "maxCandidates"
> & {
  readonly maxCandidates: number;
};

const filterAllowedRagCandidates = (
  candidates: readonly RagContextCandidate[],
  allowedSourceIds: readonly string[],
  maxCandidates: number,
): readonly RagContextCandidate[] => {
  const allowedSources = new Set(allowedSourceIds);
  return candidates
    .filter((candidate) => allowedSources.has(candidate.sourceId))
    .slice(0, maxCandidates);
};
