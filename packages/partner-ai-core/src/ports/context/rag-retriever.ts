import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { ContextRedactionClass, ContextTrustLevel } from "#domain/capabilities";

/**
 * Core RAG seam for policy-scoped retrieval before runtime execution.
 *
 * Core chooses source ids and budget, then asks an app-owned retriever for
 * candidates. Search credentials, index clients, ranking internals, and raw
 * external documents stay behind this port; runtime only receives candidates
 * that core later admits into prepared context.
 */

/**
 * Request to retrieve context from sources allowed for this turn.
 *
 * `allowedSourceIds` is the closed policy result from the selected profile and
 * manifest. Retrievers may search fewer sources, but must not widen the set.
 */
export type RagRetrievalInput = {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly requestId: string;
  readonly userMessage: string;
  readonly hostContext?: ChatStreamRequest["hostContext"] | undefined;
  readonly allowedSourceIds: readonly string[];
  readonly maxCandidates: number;
  readonly abortSignal?: AbortSignal | undefined;
};

/**
 * Retrieved candidate returned to core for admission.
 *
 * The content may become model-visible only after core applies context
 * admission. Trust, redaction, score, and token estimate are retained so the
 * prepared context manifest can explain why a candidate was used or dropped.
 */
export type RagContextCandidate = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly url?: string | undefined;
  readonly score: number;
  readonly estimatedTokens: number;
  readonly trustLevel: ContextTrustLevel;
  readonly redactionClass: ContextRedactionClass;
  readonly metadata?: JsonObject | undefined;
};

/** App-owned retrieval adapter called only during core context preparation. */
export type RagRetrieverPort = {
  readonly retrieve: (
    input: RagRetrievalInput,
  ) => Effect.Effect<readonly RagContextCandidate[], unknown>;
};
