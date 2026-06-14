import { type ContextManagerPort, type PreparedTurnContext } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { createContextCandidates } from "./candidates/context-candidate-creation.js";
import { createSimpleContextAdmission } from "./candidates/context-candidate-selection.js";
import { resolveContextProfile } from "./profile/context-profile-resolution.js";
import { createPreparedContextManifest } from "./rendering/context-manifest.js";
import { createPreparedContextSections } from "./rendering/context-section-rendering.js";
import { createRuntimeMessages } from "./rendering/runtime-message-rendering.js";
import type { ServiceContextManagerOptions } from "./service-context-manager-types.js";
import { gatherAllowedTurnContext } from "./sources/context-source-gathering.js";

export type { ServiceContextManagerOptions } from "./service-context-manager-types.js";

export const createServiceContextManager = (
  options: ServiceContextManagerOptions,
): ContextManagerPort => ({
  prepareTurnContext: (input) =>
    Effect.gen(function* () {
      // Resolve the selected profile before context work so every later record
      // uses the same policy identity that core admitted for this turn.
      const contextProfile = yield* resolveContextProfile(input.manifest, input.policyDecision);

      // Source-specific ports stay behind this service boundary; failures here
      // are pre-start setup failures before private context reaches runtime.
      const gatheredContext = yield* gatherAllowedTurnContext(options, input);

      const candidates = createContextCandidates(input, gatheredContext);
      const admission = createSimpleContextAdmission(candidates);
      const sections = createPreparedContextSections(input, gatheredContext);
      const manifest = createPreparedContextManifest({
        requestId: input.request.requestId,
        profile: contextProfile,
        policyDecision: input.policyDecision,
        sections,
        workflowArtifacts: gatheredContext.workflowArtifacts,
        admission,
        createdAt: input.now,
      });
      const runtimeMessages = createRuntimeMessages(input);

      return {
        contextId: `context_${input.request.requestId}`,
        profile: contextProfile,
        policyDecision: input.policyDecision,
        candidates,
        workflowArtifacts: gatheredContext.workflowArtifacts,
        runtimeMessages,
        contextBoard: { sections, manifest },
      } satisfies PreparedTurnContext;
    }),
});
