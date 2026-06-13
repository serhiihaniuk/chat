import type { ChatStreamRequest, JsonObject } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { ContextRedactionClass, ContextTrustLevel } from "#domain/harness";

export type ResearchAgentInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly userMessage: string;
  readonly hostContext?: ChatStreamRequest["hostContext"];
  readonly allowedSourceIds: readonly string[];
  readonly maxResearchSteps: number;
  readonly abortSignal?: AbortSignal;
};

export type ResearchSourceCandidate = {
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

export type ResearchAgentOutput = {
  readonly summary: string;
  readonly sources: readonly ResearchSourceCandidate[];
  readonly artifactId?: string;
  readonly metadata?: JsonObject;
};

export type ResearchAgentPort = {
  readonly runResearch: (input: ResearchAgentInput) => Effect.Effect<ResearchAgentOutput, unknown>;
};
