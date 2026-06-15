import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { ContextRedactionClass, ContextTrustLevel } from "#domain/capabilities";

/**
 * Core research seam for pre-answer context expansion.
 *
 * A user message, host page context, and policy-allowed source ids become a
 * `ResearchAgentOutput` before the main assistant stream starts. The output is
 * admitted as context candidates and artifacts; it must not select the executor,
 * emit browser events, or search outside the allowed source ids.
 */

/**
 * Request for a policy-allowed research pass.
 *
 * The adapter receives `allowedSourceIds` as the complete source set it may
 * search, and `maxResearchSteps` bounds work before the main assistant stream
 * can start.
 */
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

/**
 * Source candidate produced by a research adapter.
 *
 * Like RAG candidates, research source content is not automatically
 * model-visible. Core admits it into the prepared context board only after
 * applying trust, redaction, budget, and policy decisions.
 */
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

/**
 * Research output returned to core before runtime execution.
 *
 * The summary and optional artifact id describe research work for context
 * preparation and audit. They do not become browser protocol events by
 * themselves.
 */
export type ResearchAgentOutput = {
  readonly summary: string;
  readonly sources: readonly ResearchSourceCandidate[];
  readonly artifactId?: string;
  readonly metadata?: JsonObject;
};

/** App-owned research adapter called only during core context preparation. */
export type ResearchAgentPort = {
  readonly runResearch: (input: ResearchAgentInput) => Effect.Effect<ResearchAgentOutput, unknown>;
};
