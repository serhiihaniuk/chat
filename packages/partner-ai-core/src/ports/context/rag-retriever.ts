import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { ContextRedactionClass, ContextTrustLevel } from "#domain/capabilities";

export type RagRetrievalInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly userMessage: string;
  readonly hostContext?: ChatStreamRequest["hostContext"];
  readonly allowedSourceIds: readonly string[];
  readonly maxCandidates: number;
  readonly abortSignal?: AbortSignal;
};

export type RagContextCandidate = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly url?: string;
  readonly score: number;
  readonly estimatedTokens: number;
  readonly trustLevel: ContextTrustLevel;
  readonly redactionClass: ContextRedactionClass;
  readonly metadata?: JsonObject;
};

export type RagRetrieverPort = {
  readonly retrieve: (
    input: RagRetrievalInput,
  ) => Effect.Effect<readonly RagContextCandidate[], unknown>;
};
