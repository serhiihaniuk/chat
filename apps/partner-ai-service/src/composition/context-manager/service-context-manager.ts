import {
  admitConversationHistoryContext,
  type ContextManagerPort,
  type PreparedTurnContext,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createContextCandidates } from "./candidates/context-candidate-creation.js";
import { createSimpleContextAdmission } from "./candidates/context-candidate-selection.js";
import { resolveContextProfile } from "./profile/context-profile-resolution.js";
import { createPreparedContextManifest } from "./rendering/context-manifest.js";
import { createPreparedContextSections } from "./rendering/context-section-rendering.js";
import { createRuntimeMessages } from "./rendering/runtime-message-rendering.js";
import type { ServiceContextManagerOptions } from "./service-context-manager-types.js";
import { gatherAllowedTurnContext } from "./sources/context-source-gathering.js";

export type { ServiceContextManagerOptions } from "./service-context-manager-types.js";

/**
 * Build the context manager used before each runtime turn.
 *
 * Authorized context from history, memory, RAG, research, host, and tools
 * becomes a prepared context board and runtime chat messages. Runtime streaming has not
 * started here, so lookup, admission, and rendering failures stay pre-start
 * failures instead of partial assistant responses.
 */
export const createServiceContextManager = (
  options: ServiceContextManagerOptions,
): ContextManagerPort => ({
  prepareTurnContext: (input) =>
    Effect.gen(function* () {
      // Resolve the selected profile before context work so every later record
      // uses the same policy identity that core admitted for this turn.
      const contextProfile = yield* resolveContextProfile(input.manifest, input.policyDecision);

      // Gather source records under the already-admitted policy before any
      // candidate can be rendered into the model-visible context board.
      const gatheredContext = yield* gatherAllowedTurnContext(options, input);

      // Prepare candidate metadata and the current include-all admission record
      // so persisted manifests can explain what was available for the turn.
      const candidates = createContextCandidates(input, gatheredContext);
      const admission = createSimpleContextAdmission(candidates, options.contextAdmission);
      const historyAdmission = admitConversationHistoryContext({
        messages: gatheredContext.historyMessages,
        config: options.history ?? DEFAULT_SERVICE_CAPABILITY_CONFIG.history,
        currentUserMessageId: input.currentUserMessage.messageId,
      });
      // Render the selected context board and chat messages separately: history
      // can become runtime messages, while memory/RAG/research/tool context
      // stays in named context-board sections.
      const sections = createPreparedContextSections(input, gatheredContext);
      const manifest = createPreparedContextManifest({
        requestId: input.request.requestId,
        profile: contextProfile,
        policyDecision: input.policyDecision,
        sections,
        researchArtifacts: gatheredContext.researchArtifacts,
        admission,
        history: historyAdmission.manifest,
        createdAt: input.now,
      });
      const runtimeMessages = createRuntimeMessages(input, historyAdmission.admittedMessages);

      // Finalize the core-owned prepared context contract. Downstream runtime
      // code receives messages and context, not service adapter records.
      return {
        contextId: `context_${input.request.requestId}`,
        profile: contextProfile,
        policyDecision: input.policyDecision,
        history: historyAdmission.manifest,
        candidates,
        researchArtifacts: gatheredContext.researchArtifacts,
        runtimeMessages,
        contextBoard: { sections, manifest },
      } satisfies PreparedTurnContext;
    }),
});
